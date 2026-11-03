import { createContext, useContext, useMemo, useSyncExternalStore } from 'react';
import { MutationCache, QueryCache, QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AppConfig } from '../config';
import { getSession, signOut, subscribe } from '../google/auth';
import { AppData, Drive, DriveError, MIME, type DriveFile } from '../google/drive';
import { format, type MessageKey } from '../messages';

export const ConfigContext = createContext<AppConfig | null>(null);

export function useConfig(): AppConfig {
  const config = useContext(ConfigContext);
  if (!config) throw new Error('useConfig must be used inside ConfigContext');
  return config;
}

/** Translated UI copy: `t('editedBy', { name })`. */
export function useT() {
  const { messages } = useConfig();
  return (key: MessageKey, values?: Record<string, string | number>) => format(messages[key], values);
}

export const useSession = () => useSyncExternalStore(subscribe, getSession);

const isRetryable = (error: Error) => !(error instanceof DriveError) || error.status === 429 || error.status >= 500;

// An expired or revoked token ends the session; the app then asks to sign in again.
const onError = (error: unknown) => {
  if (error instanceof DriveError && error.status === 401) signOut();
};

export const createQueryClient = () =>
  new QueryClient({
    queryCache: new QueryCache({ onError }),
    mutationCache: new MutationCache({ onError }),
    defaultOptions: {
      queries: {
        staleTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        // Rate limits and server errors are transient; other 4xx answers are final.
        retry: (count, error) => count < 3 && isRetryable(error),
      },
    },
  });

function useDrive(): Drive {
  const { root } = useConfig();
  const token = useSession()?.accessToken ?? '';
  return useMemo(() => new Drive(token, root), [token, root]);
}

export function useFile(id: string) {
  const drive = useDrive();
  return useQuery({ queryKey: ['file', id], queryFn: ({ signal }) => drive.file(id, signal), enabled: !!id });
}

export function useChildren(folderId: string) {
  const drive = useDrive();
  return useQuery({ queryKey: ['children', folderId], queryFn: ({ signal }) => drive.children(folderId, signal) });
}

/** Enough recent edits to describe the week, not only fill the feed. */
const RECENT_LIMIT = 30;

export function useRecent() {
  const drive = useDrive();
  return useQuery({ queryKey: ['recent'], queryFn: ({ signal }) => drive.recent(RECENT_LIMIT, signal) });
}

const SEARCH_LIMIT = 30;

/** Full-text search across the wiki, or only inside one space when `scopeId` is set. */
export function useSearch(term: string, mimeTypes: readonly string[], scopeId?: string) {
  const drive = useDrive();
  const folders = useFolders().data;
  return useQuery({
    queryKey: ['search', term, mimeTypes, scopeId],
    queryFn: async ({ signal }) => {
      if (!scopeId || !folders) return drive.search(term, mimeTypes, SEARCH_LIMIT, signal);
      // Drive can't search a folder subtree, so a scoped search asks for more and filters here.
      const within = folders.subtree(scopeId);
      const files = await drive.search(term, mimeTypes, 200, signal);
      return files.filter(file => file.parents?.some(parent => within.has(parent))).slice(0, SEARCH_LIMIT);
    },
    enabled: term.length > 1 && (!scopeId || !!folders),
    staleTime: 60_000,
    placeholderData: previous => previous,
  });
}

export function useTemplates() {
  const drive = useDrive();
  const { templatesFolderId } = useConfig();
  return useQuery({
    queryKey: ['templates', templatesFolderId],
    queryFn: ({ signal }) => drive.templates(templatesFolderId ?? '', signal),
    enabled: !!templatesFolderId,
  });
}

export interface NewItem {
  name: string;
  kind: 'page' | 'folder';
  parentId: string;
  templateId?: string;
}

/** Creates a page or folder and refreshes every list it shows up in. */
export function useCreate() {
  const drive = useDrive();
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ name, kind, parentId, templateId }: NewItem) =>
      drive.create(name, kind === 'folder' ? MIME.folder : MIME.doc, parentId, kind === 'page' ? templateId : undefined),
    onSuccess: (_file, { kind, parentId }) =>
      Promise.all([
        client.invalidateQueries({ queryKey: ['children', parentId] }),
        client.invalidateQueries({ queryKey: [kind === 'folder' ? 'folders' : 'recent'] }),
      ]),
  });
}

export function useDocHtml(id: string, enabled = true) {
  const drive = useDrive();
  return useQuery({ queryKey: ['html', id], queryFn: ({ signal }) => drive.exportHtml(id, signal), enabled });
}

/* ------------------------------ folder index ------------------------------ */

export interface Folder {
  id: string;
  name: string;
  parentId?: string;
  /** The colour picked for the folder in Google Drive, if any. */
  color?: string;
}

/** Drive reports this grey for folders nobody coloured. */
const DEFAULT_FOLDER_COLOR = '#8f8f8f';
const HEX = /^#[0-9a-f]{6}$/i;

export interface FolderIndex {
  get: (id: string) => Folder | undefined;
  /** Sub-folders of a folder, in Drive's natural name order. */
  children: (id: string) => Folder[];
  /** The folders from the drive root down to and including `id`. */
  path: (id: string | undefined) => Folder[];
  /** Ids of a folder and every folder below it. */
  subtree: (id: string) => Set<string>;
  size: number;
}

export function buildFolderIndex(files: Pick<DriveFile, 'id' | 'name' | 'parents' | 'folderColorRgb'>[]): FolderIndex {
  const byId = new Map<string, Folder>();
  const byParent = new Map<string, Folder[]>();
  for (const file of files) {
    const color = file.folderColorRgb;
    const folder = { id: file.id, name: file.name, parentId: file.parents?.[0], color: color && HEX.test(color) && color.toLowerCase() !== DEFAULT_FOLDER_COLOR ? color : undefined };
    byId.set(folder.id, folder);
    if (folder.parentId) byParent.set(folder.parentId, [...(byParent.get(folder.parentId) ?? []), folder]);
  }
  return {
    get: id => byId.get(id),
    children: id => byParent.get(id) ?? [],
    path: id => {
      const chain: Folder[] = [];
      for (let folder = id ? byId.get(id) : undefined; folder && chain.length < 50; folder = folder.parentId ? byId.get(folder.parentId) : undefined) {
        chain.unshift(folder);
      }
      return chain;
    },
    subtree: id => {
      const ids = new Set([id]);
      // A Set iterates over entries added during the loop, so this walks breadth-first.
      for (const current of ids) for (const child of byParent.get(current) ?? []) ids.add(child.id);
      return ids;
    },
    size: byId.size,
  };
}

export function useFolders() {
  const drive = useDrive();
  return useQuery({
    queryKey: ['folders'],
    queryFn: async ({ signal }) => buildFolderIndex(await drive.folders(signal)),
  });
}

/** "Engineering / Onboarding" for a file's parent folder. */
export function usePathLabel() {
  const folders = useFolders().data;
  return (file: Pick<DriveFile, 'parents'>) =>
    folders
      ?.path(file.parents?.[0])
      .map(f => f.name)
      .join(' / ') ?? '';
}

/* -------------------------------- favourites ------------------------------- */

export interface Favorite {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
}

const FAVORITES_FILE = 'favorites.json';

export function useFavorites() {
  const token = useSession()?.accessToken ?? '';
  const client = useQueryClient();
  const appData = useMemo(() => new AppData(token), [token]);

  const query = useQuery({
    queryKey: ['favorites'],
    queryFn: async () => {
      const data = await appData.read<Favorite[]>(FAVORITES_FILE);
      return Array.isArray(data) ? data : [];
    },
    staleTime: Infinity,
  });

  const save = useMutation({
    mutationFn: (next: Favorite[]) => appData.write(FAVORITES_FILE, next),
    onMutate: async next => {
      await client.cancelQueries({ queryKey: ['favorites'] });
      const previous = client.getQueryData<Favorite[]>(['favorites']);
      client.setQueryData(['favorites'], next);
      return { previous };
    },
    onError: (_error, _next, context) => client.setQueryData(['favorites'], context?.previous),
  });

  const favorites = query.data ?? [];
  const toggle = (file: Favorite) =>
    save.mutate(
      favorites.some(f => f.id === file.id)
        ? favorites.filter(f => f.id !== file.id)
        : [...favorites, { id: file.id, name: file.name, mimeType: file.mimeType, parents: file.parents }],
    );

  return { favorites, isLoading: query.isLoading, isAvailable: !query.isError, toggle };
}
