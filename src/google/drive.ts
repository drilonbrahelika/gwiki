/**
 * A small typed client for the Google Drive API v3.
 * Reference: https://developers.google.com/workspace/drive/api/reference/rest/v3
 */
const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';

export const MIME = {
  folder: 'application/vnd.google-apps.folder',
  shortcut: 'application/vnd.google-apps.shortcut',
  doc: 'application/vnd.google-apps.document',
  sheet: 'application/vnd.google-apps.spreadsheet',
  slides: 'application/vnd.google-apps.presentation',
  drawing: 'application/vnd.google-apps.drawing',
} as const;

export interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  createdTime?: string;
  parents?: string[];
  driveId?: string;
  webViewLink?: string;
  lastModifyingUser?: { displayName?: string; photoLink?: string; me?: boolean };
  shortcutDetails?: { targetId: string; targetMimeType: string };
  folderColorRgb?: string;
}

/** Every listing asks for the same projection, so every DriveFile has one shape. */
const FILE_FIELDS =
  'id,name,mimeType,modifiedTime,createdTime,parents,driveId,webViewLink,lastModifyingUser(displayName,photoLink,me),shortcutDetails(targetId,targetMimeType)';

export class DriveError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'DriveError';
  }
}

type Params = Record<string, string | number | boolean | undefined>;

interface RequestOptions {
  token: string;
  params?: Params;
  signal?: AbortSignal;
  init?: RequestInit;
  base?: string;
}

export function buildUrl(path: string, params: Params = {}, base = API): string {
  const url = new URL(base + path);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

async function request(path: string, { token, params, signal, init, base }: RequestOptions): Promise<Response> {
  const res = await fetch(buildUrl(path, params, base), {
    ...init,
    signal,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new DriveError(res.status, body?.error?.message ?? `Google Drive request failed (HTTP ${res.status}).`);
  }
  return res;
}

/** Escapes a value for a single-quoted string inside a Drive `q` expression. */
export const quote = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** Shortcuts behave like the file they point at. */
export const resolveTarget = (file: DriveFile) =>
  file.shortcutDetails
    ? { id: file.shortcutDetails.targetId, mimeType: file.shortcutDetails.targetMimeType }
    : { id: file.id, mimeType: file.mimeType };

export const isFolder = (file: DriveFile) => resolveTarget(file).mimeType === MIME.folder;

/* -------------------------------- reading -------------------------------- */

interface FileList {
  files?: DriveFile[];
  nextPageToken?: string;
}

/** The folders below `rootId`, walking down from it. */
export function descendants(folders: DriveFile[], rootId: string): DriveFile[] {
  const byParent = new Map<string, DriveFile[]>();
  for (const folder of folders) {
    for (const parent of folder.parents ?? []) byParent.set(parent, [...(byParent.get(parent) ?? []), folder]);
  }
  const result: DriveFile[] = [];
  const seen = new Set([rootId]);
  const queue = [rootId];
  for (let id = queue.shift(); id; id = queue.shift()) {
    for (const child of byParent.get(id) ?? []) {
      if (seen.has(child.id)) continue;
      seen.add(child.id);
      result.push(child);
      queue.push(child.id);
    }
  }
  return result;
}

/** Hard stop for runaway pagination: 50 pages of 1000 items. */
const MAX_PAGES = 50;

/**
 * Where the wiki lives: a whole Shared Drive (Google Workspace), or any folder,
 * including one in a personal My Drive.
 */
export type Root = { kind: 'drive' | 'folder'; id: string };

export class Drive {
  private subtree?: Promise<Set<string>>;

  constructor(
    private readonly token: string,
    readonly root: Root,
  ) {}

  private list(params: Params, signal?: AbortSignal) {
    const scope = this.root.kind === 'drive' ? { corpora: 'drive', driveId: this.root.id } : { corpora: 'user' };
    return request('/files', {
      token: this.token,
      signal,
      params: {
        ...scope,
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        fields: `nextPageToken,files(${FILE_FIELDS})`,
        ...params,
      },
    }).then(res => res.json() as Promise<FileList>);
  }

  private get(id: string, fields: string, signal?: AbortSignal): Promise<DriveFile> {
    return request(`/files/${encodeURIComponent(id)}`, { token: this.token, signal, params: { fields, supportsAllDrives: true } }).then(
      res => res.json() as Promise<DriveFile>,
    );
  }

  /** The wiki root's own name: the Shared Drive's, or the root folder's. */
  async rootName(signal?: AbortSignal): Promise<string> {
    if (this.root.kind === 'folder') return (await this.get(this.root.id, 'name', signal)).name;
    const res = await request(`/drives/${encodeURIComponent(this.root.id)}`, { token: this.token, signal, params: { fields: 'name' } });
    return ((await res.json()) as { name: string }).name;
  }

  /** Follows `nextPageToken` until the listing is complete. */
  private async listAll(params: Params, signal?: AbortSignal): Promise<DriveFile[]> {
    const files: DriveFile[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await this.list({ ...params, pageSize: 1000, pageToken }, signal);
      files.push(...(res.files ?? []));
      pageToken = res.nextPageToken;
      if (!pageToken) break;
    }
    return files;
  }

  /** All children of a folder, folders first, alphabetical. */
  children(folderId: string, signal?: AbortSignal): Promise<DriveFile[]> {
    return this.listAll({ q: `${quote(folderId)} in parents and trashed = false`, orderBy: 'folder,name_natural' }, signal);
  }

  /**
   * Every folder in the wiki, in one paged query. The tree, breadcrumbs and paths
   * are then answered from memory instead of one request per level.
   */
  async folders(signal?: AbortSignal): Promise<DriveFile[]> {
    const all = await this.listAll(
      { q: `mimeType = ${quote(MIME.folder)} and trashed = false`, orderBy: 'name_natural', fields: 'nextPageToken,files(id,name,parents,folderColorRgb)' },
      signal,
    );
    return this.root.kind === 'drive' ? all : descendants(all, this.root.id);
  }

  /** Ids of the root folder and every folder below it (folder roots only). */
  private subtreeIds(): Promise<Set<string>> {
    // Shared by every query, so it ignores any one caller's abort signal; a failure is not cached.
    this.subtree ??= this.folders().then(
      folders => new Set([this.root.id, ...folders.map(f => f.id)]),
      error => {
        this.subtree = undefined;
        throw error;
      },
    );
    return this.subtree;
  }

  /**
   * Keeps files that sit inside the wiki. A Shared Drive is scoped by the query
   * itself; a folder root is checked against its folder tree.
   */
  private async inScope(files: DriveFile[]): Promise<DriveFile[]> {
    if (this.root.kind === 'drive') return files;
    const ids = await this.subtreeIds();
    return files.filter(file => file.parents?.some(parent => ids.has(parent)));
  }

  /** Most recently modified documents. */
  async recent(limit = 15, signal?: AbortSignal): Promise<DriveFile[]> {
    const res = await this.list(
      {
        q: `trashed = false and mimeType != ${quote(MIME.folder)} and mimeType != ${quote(MIME.shortcut)}`,
        orderBy: 'modifiedTime desc',
        // A folder root filters after the fact, so it asks for more to fill the list.
        pageSize: this.root.kind === 'drive' ? limit : 200,
      },
      signal,
    );
    return (await this.inScope(res.files ?? [])).slice(0, limit);
  }

  /** Full-text search over names and content, optionally limited to some file types. */
  async search(term: string, mimeTypes: readonly string[] = [], limit = 30, signal?: AbortSignal): Promise<DriveFile[]> {
    const types = mimeTypes.length
      ? ` and (${mimeTypes.map(m => `mimeType = ${quote(m)}`).join(' or ')})`
      : ` and mimeType != ${quote(MIME.folder)}`;
    const res = await this.list(
      { q: `fullText contains ${quote(term)} and trashed = false${types}`, pageSize: this.root.kind === 'drive' ? limit : 200 },
      signal,
    );
    return (await this.inScope(res.files ?? [])).slice(0, limit);
  }

  /**
   * One file's metadata. `files.get` cannot be scoped, so scope is checked here:
   * the wiki only ever shows content from inside its own root.
   */
  async file(id: string, signal?: AbortSignal): Promise<DriveFile> {
    if (id === this.root.id) return { id, name: await this.rootName(signal), mimeType: MIME.folder };

    const file = await this.get(id, FILE_FIELDS, signal);
    const inside = this.root.kind === 'drive' ? file.driveId === this.root.id : (await this.inScope([file])).length > 0;
    if (!inside) throw new DriveError(404, 'This file is not part of the wiki.');
    return file;
  }

  /** Google Docs in a templates folder, which may sit outside the wiki. */
  async templates(folderId: string, signal?: AbortSignal): Promise<DriveFile[]> {
    const res = await request('/files', {
      token: this.token,
      signal,
      params: {
        q: `${quote(folderId)} in parents and mimeType = ${quote(MIME.doc)} and trashed = false`,
        corpora: 'allDrives',
        includeItemsFromAllDrives: true,
        supportsAllDrives: true,
        orderBy: 'name_natural',
        fields: 'files(id,name,mimeType)',
      },
    });
    return ((await res.json()) as FileList).files ?? [];
  }

  /**
   * A new folder or Google Doc inside `parentId`: empty, or a copy of `templateId`.
   * Drive itself checks that the user may add to that folder.
   */
  async create(name: string, mimeType: string, parentId: string, templateId?: string): Promise<DriveFile> {
    const res = await request(templateId ? `/files/${encodeURIComponent(templateId)}/copy` : '/files', {
      token: this.token,
      params: { supportsAllDrives: true, fields: FILE_FIELDS },
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, parents: [parentId], ...(templateId ? {} : { mimeType }) }),
      },
    });
    // A new folder widens the wiki's subtree, so the scope check must see it.
    this.subtree = undefined;
    return res.json() as Promise<DriveFile>;
  }

  /** A Google Doc as HTML. Drive caps exports at 10 MB. */
  async exportHtml(id: string, signal?: AbortSignal): Promise<string> {
    const res = await request(`/files/${encodeURIComponent(id)}/export`, {
      token: this.token,
      signal,
      params: { mimeType: 'text/html' },
    });
    return res.text();
  }
}

/* ------------------------- per-user app data folder ------------------------ */

/**
 * Small JSON documents in the user's hidden `appDataFolder`. They follow the
 * Google account across devices and no other user or app can read them.
 */
export class AppData {
  constructor(private readonly token: string) {}

  private async find(name: string): Promise<string | undefined> {
    const res = await request('/files', {
      token: this.token,
      params: { spaces: 'appDataFolder', q: `name = ${quote(name)} and trashed = false`, fields: 'files(id)', pageSize: 1 },
    });
    return ((await res.json()) as FileList).files?.[0]?.id;
  }

  async read<T>(name: string): Promise<T | null> {
    const id = await this.find(name);
    if (!id) return null;
    const res = await request(`/files/${encodeURIComponent(id)}`, { token: this.token, params: { alt: 'media' } });
    return res.json().catch(() => null);
  }

  async write(name: string, data: unknown): Promise<void> {
    const body = JSON.stringify(data);
    const id = await this.find(name);
    if (id) {
      await request(`/files/${encodeURIComponent(id)}`, {
        token: this.token,
        base: UPLOAD_API,
        params: { uploadType: 'media' },
        init: { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body },
      });
      return;
    }

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify({ name, parents: ['appDataFolder'] })], { type: 'application/json' }));
    form.append('file', new Blob([body], { type: 'application/json' }));
    await request('/files', {
      token: this.token,
      base: UPLOAD_API,
      params: { uploadType: 'multipart' },
      init: { method: 'POST', body: form },
    });
  }
}

/* -------------------------------- previews -------------------------------- */

/**
 * Google's own viewer for anything that is not a Google Doc. The URL is always one
 * of these fixed templates, never taken from file content.
 */
export function previewUrl(id: string, mimeType: string): string {
  const safe = encodeURIComponent(id);
  switch (mimeType) {
    case MIME.sheet:
      return `https://docs.google.com/spreadsheets/d/${safe}/preview`;
    case MIME.slides:
      return `https://docs.google.com/presentation/d/${safe}/preview`;
    case MIME.drawing:
      return `https://docs.google.com/drawings/d/${safe}/preview`;
    default:
      return `https://drive.google.com/file/d/${safe}/preview`;
  }
}
