import { afterEach, describe, expect, it, vi } from 'vitest';
import { Drive, DriveError, MIME, buildUrl, previewUrl, quote, resolveTarget } from './drive';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => vi.unstubAllGlobals());

describe('query helpers', () => {
  it('escapes quotes and backslashes in q values', () => {
    expect(quote("it's")).toBe("'it\\'s'");
    expect(quote('a\\b')).toBe("'a\\\\b'");
  });

  it('builds URLs and drops undefined params', () => {
    expect(buildUrl('/files', { a: 1, b: undefined, c: 'x y' })).toBe('https://www.googleapis.com/drive/v3/files?a=1&c=x+y');
  });

  it('resolves shortcuts to their target', () => {
    const shortcut = { id: 's', name: 'S', mimeType: MIME.shortcut, shortcutDetails: { targetId: 't', targetMimeType: MIME.folder } };
    expect(resolveTarget(shortcut)).toEqual({ id: 't', mimeType: MIME.folder });
  });

  it('only ever produces Google preview URLs', () => {
    expect(previewUrl('a/b', 'application/pdf')).toBe('https://drive.google.com/file/d/a%2Fb/preview');
    expect(previewUrl('x', MIME.sheet)).toBe('https://docs.google.com/spreadsheets/d/x/preview');
  });
});

describe('Drive', () => {
  it('follows nextPageToken until the listing is complete', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(json({ files: [{ id: '1' }], nextPageToken: 'p2' }))
      .mockResolvedValueOnce(json({ files: [{ id: '2' }] }));
    vi.stubGlobal('fetch', fetch);

    const files = await new Drive('tok', { kind: 'drive', id: 'drive1' }).children('folder');
    expect(files.map(f => f.id)).toEqual(['1', '2']);

    const second = new URL(fetch.mock.calls[1]?.[0] as string);
    expect(second.searchParams.get('pageToken')).toBe('p2');
    expect(second.searchParams.get('driveId')).toBe('drive1');
    expect(second.searchParams.get('corpora')).toBe('drive');
    expect(fetch.mock.calls[0]?.[1].headers.Authorization).toBe('Bearer tok');
  });

  it('creates a Doc in a folder, or copies a template there', async () => {
    const fetch = vi.fn().mockImplementation(() => Promise.resolve(json({ id: 'new' })));
    vi.stubGlobal('fetch', fetch);
    const drive = new Drive('tok', { kind: 'folder', id: 'root' });

    await drive.create('Plan', MIME.doc, 'f1');
    const [url, init] = fetch.mock.calls[0] ?? [];
    expect(new URL(url as string).pathname).toBe('/drive/v3/files');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({ name: 'Plan', parents: ['f1'], mimeType: MIME.doc });

    await drive.create('Plan', MIME.doc, 'f1', 'tpl');
    const [copyUrl, copyInit] = fetch.mock.calls[1] ?? [];
    expect(new URL(copyUrl as string).pathname).toBe('/drive/v3/files/tpl/copy');
    expect(JSON.parse(copyInit.body)).toEqual({ name: 'Plan', parents: ['f1'] });
  });

  it('rejects files from outside the configured Shared Drive', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ id: 'x', name: 'X', mimeType: MIME.doc, driveId: 'other' })));
    await expect(new Drive('tok', { kind: 'drive', id: 'drive1' }).file('x')).rejects.toMatchObject({ status: 404 });
  });

  it('surfaces the HTTP status and Google error message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: { message: 'Rate limit' } }, 429)));
    const error = await new Drive('tok', { kind: 'drive', id: 'd' }).recent().catch(e => e);
    expect(error).toBeInstanceOf(DriveError);
    expect(error).toMatchObject({ status: 429, message: 'Rate limit' });
  });

  it('scopes a folder root to the folders below it', async () => {
    const folders = [
      { id: 'a', name: 'A', parents: ['root'] },
      { id: 'b', name: 'B', parents: ['a'] },
      { id: 'elsewhere', name: 'E', parents: ['other'] },
    ];
    const recent = [
      { id: 'in', name: 'In', parents: ['b'] },
      { id: 'out', name: 'Out', parents: ['elsewhere'] },
    ];
    const fetch = vi.fn((url: string) => {
      const q = new URL(url).searchParams.get('q') ?? '';
      return Promise.resolve(json({ files: q.startsWith('mimeType =') ? folders : recent }));
    });
    vi.stubGlobal('fetch', fetch);

    const drive = new Drive('tok', { kind: 'folder', id: 'root' });
    expect((await drive.recent()).map(f => f.id)).toEqual(['in']);
    expect(new URL(fetch.mock.calls[0]?.[0] as string).searchParams.get('corpora')).toBe('user');
    await expect(drive.file('out')).rejects.toMatchObject({ status: 404 });
  });
});
