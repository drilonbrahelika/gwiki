import { useCallback, useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { isFolder, MIME, previewUrl, type DriveFile } from '../google/drive';
import { type Folder, useChildren, useConfig, useDocHtml, useFavorites, useFile, useFolders, useRecent, useSession, useT } from '../lib/data';
import { dateTime, olderThan, timeAgo } from '../lib/format';
import { navigate } from '../lib/route';
import { DocFrame, headingOffset, scrollToHeading, type Heading, type Outline } from './DocFrame';
import { CopyLinkButton, ShareMenu, pageUrl, useCopy } from './Share';
import { ClockIcon, ExternalIcon, RefreshIcon, SearchIcon, StarIcon } from './icons';
import { Crumbs, Topbar } from './Layout';
import { NewMenu, useCanCreate } from './Create';
import { Avatar, ErrorNotice, FileList, Kind, Link, ListSkeleton, SpaceAvatar, spaceStyle } from './ui';
import { recordVisit, useVisits } from '../lib/history';
import type { MessageKey } from '../messages';

type T = ReturnType<typeof useT>;

/** "1 folder", "3 pages": the singular and plural are separate messages, so translations can differ. */
const count = (t: T, n: number, one: MessageKey, many: MessageKey) => (n === 1 ? t(one) : t(many, { count: n }));

/** What a folder holds, e.g. "2 folders · 5 pages". */
function summary(t: T, files: DriveFile[]) {
  const folders = files.filter(isFolder).length;
  const pages = files.length - folders;
  return [folders && count(t, folders, 'folderCount', 'foldersCount'), pages && count(t, pages, 'pageCount', 'pagesCount')].filter(Boolean).join(' · ');
}

function greetingKey(hour: number) {
  if (hour < 12) return 'greetingMorning' as const;
  if (hour < 18) return 'greetingAfternoon' as const;
  return 'greetingEvening' as const;
}

/** A typical silent reading speed, for "5 min read". */
const WORDS_PER_MINUTE = 230;

/** Pages opened lately in this browser, as cards. */
function RecentlyVisited() {
  const t = useT();
  const index = useFolders().data;
  const visits = useVisits().slice(0, 4);
  if (visits.length === 0) return null;
  return (
    <section className="section">
      <div className="section-head"><h2><ClockIcon size={14} /> {t('recentlyVisited')}</h2></div>
      <div className="visits">
        {visits.map(visit => {
          const space = index?.path(visit.parents?.[0])[0];
          return (
            <Link key={visit.id} to={{ id: visit.id }} className="visit">
              <span className="visit-band"><Kind mimeType={visit.mimeType} size={16} /></span>
              <span className="visit-body">
                <strong>{visit.name}</strong>
                <span className="meta">
                  {space && <span className="dot" style={spaceStyle(space)} />}
                  <span className="truncate">{[space?.name, visit.at && timeAgo(new Date(visit.at).toISOString())].filter(Boolean).join(' · ')}</span>
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}

/** Every space as a card with its lettered tile, and when it last changed. */
function SpaceCards({ spaces, recent }: { spaces: Folder[]; recent: DriveFile[] }) {
  const t = useT();
  const index = useFolders().data;
  return (
    <div className="spaces">
      {spaces.map(space => {
        const latest = recent.find(f => index?.path(f.parents?.[0])[0]?.id === space.id)?.modifiedTime;
        const sub = index?.children(space.id).length ?? 0;
        const meta = latest ? t('updatedAgo', { time: timeAgo(latest) }) : sub > 0 ? count(t, sub, 'folderCount', 'foldersCount') : '';
        return (
          <Link key={space.id} to={{ id: space.id }} className="space-card">
            <SpaceAvatar space={space} size="lg" />
            <span>
              <strong>{space.name}</strong>
              {meta && <span className="meta">{meta}</span>}
            </span>
          </Link>
        );
      })}
    </div>
  );
}

export function HomeView({ onSearch }: { onSearch: () => void }) {
  const { root, appName } = useConfig();
  const t = useT();
  const session = useSession();
  const recent = useRecent();
  const folders = useFolders();
  const spaces = folders.data?.children(root.id) ?? [];
  const firstName = session?.name?.split(' ')[0];
  const [hour] = useState(() => new Date().getHours());
  const files = recent.data ?? [];

  return (
    <>
      <Topbar><Crumbs /></Topbar>
      <div className="page">
        <section className="home-head">
          <h1>{firstName ? t(greetingKey(hour), { name: firstName }) : appName}</h1>
          <button type="button" className="home-search" onClick={onSearch}>
            <SearchIcon size={16} />
            <span>{t('searchApp', { appName })}</span>
            <kbd className="hide-sm">⌘K</kbd>
          </button>
        </section>

        <RecentlyVisited />

        {spaces.length > 0 && (
          <section className="section">
            <div className="section-head"><h2>{t('spaces')}</h2></div>
            <SpaceCards spaces={spaces} recent={files} />
          </section>
        )}

        <section className="section">
          <div className="section-head"><h2>{t('recentlyUpdated')}</h2></div>
          {recent.isLoading ? (
            <ListSkeleton />
          ) : recent.error ? (
            <ErrorNotice error={recent.error} />
          ) : (
            <FileList files={files.slice(0, 10)} empty={t('nothingYet')} />
          )}
        </section>
      </div>
    </>
  );
}

export function StarredView() {
  const t = useT();
  const { favorites, isLoading, isAvailable } = useFavorites();
  return (
    <>
      <Topbar><Crumbs current={t('starred')} /></Topbar>
      <div className="page">
        <header className="page-head">
          <span className="page-head-icon"><StarIcon size={20} /></span>
          <div><h1 className="title">{t('starred')}</h1></div>
        </header>
        {isLoading ? <ListSkeleton rows={3} /> : <FileList files={favorites} empty={isAvailable ? t('starredEmpty') : t('starredUnavailable')} />}
      </div>
    </>
  );
}

/** Subfolders as simple tiles above the pages. */
function FolderTiles({ folders }: { folders: DriveFile[] }) {
  const t = useT();
  const index = useFolders().data;
  return (
    <div className="folders">
      {folders.map(folder => {
        const sub = index?.children(folder.id).length ?? 0;
        return (
          <Link key={folder.id} to={{ id: folder.id }} className="folder-tile">
            <Kind mimeType={MIME.folder} size={17} />
            <strong>{folder.name}</strong>
            {sub > 0 && <span>{count(t, sub, 'folderCount', 'foldersCount')}</span>}
          </Link>
        );
      })}
    </div>
  );
}

function FolderView({ folder }: { folder: DriveFile }) {
  const t = useT();
  const { root } = useConfig();
  const children = useChildren(folder.id);
  const isSpace = folder.parents?.[0] === root.id;
  const canCreate = useCanCreate();
  const files = children.data ?? [];
  const subfolders = files.filter(isFolder);
  const pages = files.filter(f => !isFolder(f));

  return (
    <>
      <Topbar
        actions={
          <>
            <ShareMenu file={folder} />
            <CopyLinkButton file={folder} />
            <StarButton file={folder} />
            {canCreate && <NewMenu parent={folder} />}
          </>
        }
      >
        <Crumbs folderId={folder.parents?.[0]} current={folder.name} />
      </Topbar>
      <div className="page">
        <header className="page-head">
          {isSpace ? <SpaceAvatar space={{ name: folder.name, color: folder.folderColorRgb }} size="xl" /> : <span className="page-head-icon"><Kind mimeType={MIME.folder} size={22} /></span>}
          <div>
            <h1 className="title">{folder.name}</h1>
            {files.length > 0 && <p className="page-head-sub">{summary(t, files)}</p>}
          </div>
        </header>
        {children.isLoading ? (
          <ListSkeleton />
        ) : children.error ? (
          <ErrorNotice error={children.error} />
        ) : files.length === 0 ? (
          <div className="empty">{t('folderEmpty')}</div>
        ) : (
          <>
            {subfolders.length > 0 && (
              <section className="section">
                <div className="section-head"><h2>{t('folders')}</h2></div>
                <FolderTiles folders={subfolders} />
              </section>
            )}
            {pages.length > 0 && (
              <section className="section">
                <div className="section-head"><h2>{t('pages')}</h2></div>
                <FileList files={pages} empty="" showPath={false} />
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}

function StarButton({ file }: { file: DriveFile }) {
  const t = useT();
  const { favorites, isAvailable, toggle } = useFavorites();
  if (!isAvailable) return null;
  const starred = favorites.some(f => f.id === file.id);
  const label = starred ? t('unstar') : t('star');
  return (
    <button type="button" className="icon-button" aria-pressed={starred} aria-label={label} title={label} onClick={() => toggle(file)}>
      <StarIcon size={17} />
    </button>
  );
}

/** Highlights the section currently under the top bar. */
function useActiveHeading(headings: Heading[]) {
  const [active, setActive] = useState<string>();
  useEffect(() => {
    const onScroll = () => {
      const frame = document.querySelector<HTMLIFrameElement>('.doc-frame');
      const doc = frame?.contentDocument;
      if (!frame || !doc) return;
      const offset = window.scrollY + headingOffset() + 24 - (frame.getBoundingClientRect().top + window.scrollY);
      let current = headings[0]?.id;
      for (const h of headings) if ((doc.getElementById(h.id)?.offsetTop ?? Infinity) <= offset) current = h.id;
      setActive(current);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [headings]);
  return active;
}

/**
 * Pages are edited in Google, not here. When the reader comes back to this tab (or once a
 * minute while it is open) the file's metadata is re-read; if it changed since the content
 * on screen was loaded, `stale` is set so the page can offer the newer version.
 */
function useLatestVersion(file: DriveFile) {
  const queryClient = useQueryClient();
  const [shown, setShown] = useState(file.modifiedTime);

  useEffect(() => {
    const check = () => {
      if (document.visibilityState === 'visible') void queryClient.invalidateQueries({ queryKey: ['file', file.id] });
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    const timer = setInterval(check, 60_000);
    return () => {
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
      clearInterval(timer);
    };
  }, [file.id, queryClient]);

  const reload = () => {
    setShown(file.modifiedTime);
    void queryClient.invalidateQueries({ queryKey: ['html', file.id] });
  };
  return { stale: !!shown && !!file.modifiedTime && file.modifiedTime > shown, reload, version: shown };
}

function DocumentView({ file }: { file: DriveFile }) {
  const t = useT();
  const { fontsUrl, staleAfterDays } = useConfig();
  const isDoc = file.mimeType === MIME.doc;
  const html = useDocHtml(file.id, isDoc);
  const [outline, setOutline] = useState<Outline>({ headings: [], words: 0 });
  const onOutline = useCallback((o: Outline) => setOutline(o), []);
  const headings = outline.headings;
  const active = useActiveHeading(headings);
  const editor = file.lastModifyingUser?.displayName;
  const latest = useLatestVersion(file);
  const minutes = Math.ceil(outline.words / WORDS_PER_MINUTE);
  const stale = staleAfterDays > 0 && olderThan(file.modifiedTime, staleAfterDays);
  const sectionCopy = useCopy(2000);
  const parent = file.parents?.[0];
  useEffect(() => recordVisit({ id: file.id, name: file.name, mimeType: file.mimeType, parents: parent ? [parent] : undefined }), [file.id, file.name, file.mimeType, parent]);

  return (
    <>
      <Topbar
        notice={
          latest.stale && (
            <div className="notice" role="status">
              <RefreshIcon size={15} />
              <span>{t('pageEdited')}</span>
              <button type="button" className="button button-primary" onClick={latest.reload}>{t('showLatest')}</button>
            </div>
          )
        }
        actions={
          <>
            <ShareMenu file={file} section={headings.find(h => h.id === active)} />
            <CopyLinkButton file={file} />
            <StarButton file={file} />
            {file.webViewLink && (
              <a className="button button-quiet" href={file.webViewLink} target="_blank" rel="noopener noreferrer" title={t('openInGoogle')}>
                <ExternalIcon size={15} /> <span>{t('openInGoogle')}</span>
              </a>
            )}
          </>
        }
      >
        <Crumbs folderId={file.parents?.[0]} current={file.name} />
      </Topbar>

      <div className="doc">
        <article className="doc-main">
          <h1 className="doc-title">{file.name}</h1>
          <div className="byline">
            {editor && <Avatar name={editor} src={file.lastModifyingUser?.photoLink} />}
            {editor && <span className="fact"><strong>{editor}</strong></span>}
            {file.modifiedTime && <time className="fact" dateTime={file.modifiedTime} title={dateTime(file.modifiedTime)}>{t('editedAgo', { time: timeAgo(file.modifiedTime) })}</time>}
            {minutes > 0 && <span className="fact">{t('readTime', { count: minutes })}</span>}
            {stale && <span className="badge" title={t('staleHint', { days: staleAfterDays })}>{t('staleBadge')}</span>}
          </div>
          {!isDoc ? (
            <iframe key={latest.version} className="doc-preview" title={file.name} src={previewUrl(file.id, file.mimeType)} allow="autoplay; fullscreen" />
          ) : html.isLoading ? (
            <div style={{ display: 'grid', gap: 14, marginTop: 24 }}>
              {[92, 100, 84, 96, 60].map(w => <span key={w} className="skeleton" style={{ width: `${w}%` }} />)}
            </div>
          ) : html.error ? (
            <ErrorNotice error={html.error} />
          ) : (
            <DocFrame html={html.data ?? ''} title={file.name} fontsUrl={fontsUrl} onOutline={onOutline} onAnchor={id => void sectionCopy.copy(pageUrl(file.id, id))} />
          )}
        </article>

        {sectionCopy.copied && <div className="toast" role="status">{t('linkCopied')}</div>}
        <aside className="doc-aside">
          {headings.length > 1 && (
            <nav className="toc" aria-label={t('onThisPage')}>
              <div className="toc-label">{t('onThisPage')}</div>
              {headings.map(h => (
                <a
                  key={h.id}
                  href={`#${h.id}`}
                  data-level={h.level}
                  aria-current={active === h.id}
                  onClick={e => {
                    e.preventDefault();
                    scrollToHeading(h.id);
                  }}
                >
                  {h.text}
                </a>
              ))}
            </nav>
          )}
        </aside>
      </div>
    </>
  );
}

function Redirect({ id }: { id: string }) {
  useEffect(() => navigate({ id }, { replace: true }), [id]);
  return null;
}

export function ItemView({ id }: { id: string }) {
  const file = useFile(id);
  if (file.isLoading) {
    return (
      <>
        <Topbar />
        <div className="page"><ListSkeleton /></div>
      </>
    );
  }
  if (file.error || !file.data) {
    return (
      <>
        <Topbar><Crumbs /></Topbar>
        <div className="page"><ErrorNotice error={file.error} /></div>
      </>
    );
  }
  if (file.data.shortcutDetails) return <Redirect id={file.data.shortcutDetails.targetId} />;
  return file.data.mimeType === MIME.folder ? <FolderView folder={file.data} /> : <DocumentView file={file.data} />;
}

