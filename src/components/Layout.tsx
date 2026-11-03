import { Fragment, useCallback, useContext, useRef, useState } from 'react';
import { useIsFetching } from '@tanstack/react-query';
import { MIME } from '../google/drive';
import { signOut } from '../google/auth';
import { useChildren, useConfig, useFavorites, useFolders, useSession, useT, type Folder, type FolderIndex } from '../lib/data';
import { href, useRoute } from '../lib/route';
import { setThemeMode, useTheme } from '../lib/theme';
import { CheckIcon, ChevronIcon, HelpIcon, HomeIcon, KeyboardIcon, LinkIcon, MenuIcon, MoonIcon, PlusIcon, SearchIcon, SignOutIcon, StarIcon, SunIcon } from './icons';
import { Avatar, BrandMark, Kind, Link, SpaceAvatar, useDismiss } from './ui';
import { CreateContext, useCanCreate } from './Create';

const INDENT = 16;

/** Pages directly inside an open folder, listed under its subfolders as in any wiki page tree. */
function TreePages({ folderId, depth, activeId }: { folderId: string; depth: number; activeId?: string }) {
  const pages = useChildren(folderId).data?.filter(f => f.mimeType !== MIME.folder) ?? [];
  return pages.map(page => (
    <li key={page.id}>
      <div className="tree-row" style={{ paddingLeft: 4 + depth * INDENT }} aria-current={activeId === page.id ? 'page' : undefined}>
        <span className="tree-spacer" />
        <Kind mimeType={page.mimeType} size={15} />
        <Link to={{ id: page.shortcutDetails?.targetId ?? page.id }} className="truncate">{page.name}</Link>
      </div>
    </li>
  ));
}

/** Hover actions on a space: share a link to it, search inside it, star it. */
function SpaceActions({ folder, onSearch }: { folder: Folder; onSearch: (scopeId: string) => void }) {
  const t = useT();
  const { favorites, isAvailable, toggle } = useFavorites();
  const [copied, setCopied] = useState(false);
  const starred = favorites.some(f => f.id === folder.id);
  const copyLabel = copied ? t('linkCopied') : t('copyLink', { space: folder.name });
  const copy = () =>
    navigator.clipboard.writeText(new URL(href({ id: folder.id }), location.origin).href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });

  return (
    <span className="tree-actions">
      <button type="button" className="tree-action" aria-label={copyLabel} title={copyLabel} onClick={copy}>
        {copied ? <CheckIcon size={14} /> : <LinkIcon size={14} />}
      </button>
      <button type="button" className="tree-action" aria-label={t('searchSpace', { space: folder.name })} title={t('searchSpace', { space: folder.name })} onClick={() => onSearch(folder.id)}>
        <SearchIcon size={14} />
      </button>
      {isAvailable && (
        <button
          type="button"
          className="tree-action"
          aria-pressed={starred}
          aria-label={starred ? t('unstar') : t('star')}
          title={starred ? t('unstar') : t('star')}
          onClick={() => toggle({ id: folder.id, name: folder.name, mimeType: MIME.folder, parents: folder.parentId ? [folder.parentId] : undefined })}
        >
          <StarIcon size={14} />
        </button>
      )}
    </span>
  );
}

interface TreeProps {
  index: FolderIndex;
  activeId?: string;
  /** Folders on the path to the current page; they open by themselves. */
  openIds: Set<string>;
  onSearch: (scopeId: string) => void;
}

function TreeNode({ folder, depth, ...tree }: TreeProps & { folder: Folder; depth: number }) {
  const { index, activeId, openIds, onSearch } = tree;
  const t = useT();
  const canCreate = useCanCreate();
  const create = useContext(CreateContext);
  const onPath = openIds.has(folder.id);
  const [toggled, setToggled] = useState<boolean>();
  const [wasOnPath, setWasOnPath] = useState(onPath);
  // Arriving at a folder from anywhere (the main page, a link, back) reopens it even if it was collapsed.
  if (onPath !== wasOnPath) {
    setWasOnPath(onPath);
    if (onPath) setToggled(undefined);
  }
  const open = toggled ?? onPath;

  return (
    <li>
      <div className="tree-row" style={{ paddingLeft: 4 + depth * INDENT }} aria-current={activeId === folder.id ? 'page' : undefined}>
        <button type="button" className="tree-toggle" aria-expanded={open} aria-label={folder.name} onClick={() => setToggled(!open)}>
          <ChevronIcon size={12} />
        </button>
        {depth === 0 ? <SpaceAvatar space={folder} size="sm" /> : <Kind mimeType={MIME.folder} size={15} />}
        {/* The name opens the folder's page and expands it here, so both stay in step. */}
        <Link to={{ id: folder.id }} className="truncate" onClick={() => setToggled(true)}>{folder.name}</Link>
        {depth === 0 && <SpaceActions folder={folder} onSearch={onSearch} />}
        {canCreate && (
          <button type="button" className="tree-action" aria-label={t('newPageIn', { folder: folder.name })} title={t('newPageIn', { folder: folder.name })} onClick={() => create({ parent: folder, kind: 'page' })}>
            <PlusIcon size={14} />
          </button>
        )}
      </div>
      {open && (
        <ul className="tree">
          {index.children(folder.id).map(child => (
            <TreeNode key={child.id} folder={child} depth={depth + 1} {...tree} />
          ))}
          <TreePages folderId={folder.id} depth={depth + 1} activeId={activeId} />
        </ul>
      )}
    </li>
  );
}

/** Light or dark in one click. Until it is used, the wiki follows the system setting. */
function ThemeToggle() {
  const t = useT();
  const { resolved } = useTheme();
  const next = resolved === 'dark' ? 'light' : 'dark';
  const label = t(next === 'dark' ? 'themeToDark' : 'themeToLight');
  return (
    <button type="button" className="theme-toggle" aria-label={label} title={label} onClick={() => setThemeMode(next)}>
      {resolved === 'dark' ? <SunIcon size={16} /> : <MoonIcon size={15} />}
    </button>
  );
}

function Brand() {
  const { appName, logoUrl } = useConfig();
  return (
    <Link to={{}} className="brand">
      <BrandMark name={appName} logoUrl={logoUrl} />
      {!logoUrl && <span className="brand-name">{appName}</span>}
    </Link>
  );
}

function SearchButton({ onSearch }: { onSearch: () => void }) {
  const t = useT();
  return (
    <button type="button" className="nav-item search-trigger" onClick={onSearch}>
      <SearchIcon /> {t('search')} <kbd className="hide-sm">⌘K</kbd>
    </button>
  );
}

/** The signed-in person; their menu holds sign out and, where there is a keyboard, the shortcuts. */
function Account({ onShortcuts, up = false, showName = false }: { onShortcuts: () => void; up?: boolean; showName?: boolean }) {
  const { supportUrl } = useConfig();
  const t = useT();
  const session = useSession();
  const [menu, setMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const user = session?.name ?? session?.email ?? '';
  const closeMenu = useCallback(() => setMenu(false), []);
  useDismiss(menuRef, menu, closeMenu);

  return (
    <div className="account" ref={menuRef}>
      <button type="button" className="account-button" aria-haspopup="menu" aria-expanded={menu} aria-label={user} onClick={() => setMenu(!menu)}>
        <Avatar name={user} src={session?.picture} />
        {showName && <span className="truncate">{session?.name ?? session?.email}</span>}
      </button>
      {menu && (
        <div className={up ? 'menu menu-up' : 'menu'} role="menu">
          <div className="menu-head">
            <strong className="truncate">{session?.name ?? session?.email}</strong>
            {session?.name && <span className="truncate">{session.email}</span>}
          </div>
          <button type="button" role="menuitem" className="menu-item hide-sm" onClick={() => { setMenu(false); onShortcuts(); }}>
            <KeyboardIcon size={16} /> {t('shortcuts')} <kbd className="menu-kbd">?</kbd>
          </button>
          {supportUrl && (
            <a role="menuitem" className="menu-item" href={supportUrl} target="_blank" rel="noopener noreferrer">
              <HelpIcon size={16} /> {t('navHelp')}
            </a>
          )}
          <button type="button" role="menuitem" className="menu-item" onClick={signOut}>
            <SignOutIcon size={16} /> {t('signOut')}
          </button>
        </div>
      )}
    </div>
  );
}

/** Small screens: the sidebar folds away, and this bar keeps the menu, search, theme and account at hand. */
export function GlobalNav({ onMenu, onSearch, onShortcuts }: { onMenu: () => void; onSearch: () => void; onShortcuts: () => void }) {
  const t = useT();
  return (
    <header className="globalnav">
      <button type="button" className="icon-button" aria-label={t('menu')} onClick={onMenu}>
        <MenuIcon size={20} />
      </button>
      <Brand />
      <button type="button" className="icon-button" aria-label={t('search')} onClick={onSearch}>
        <SearchIcon size={18} />
      </button>
      <ThemeToggle />
      <Account onShortcuts={onShortcuts} />
    </header>
  );
}

export function Sidebar({ open, activeFolderId, onSearch, onShortcuts }: { open: boolean; activeFolderId?: string; onSearch: (scopeId?: string) => void; onShortcuts: () => void }) {
  const { appName, root } = useConfig();
  const t = useT();
  const route = useRoute();
  const folders = useFolders().data;
  const { favorites } = useFavorites();
  const openIds = new Set(folders?.path(activeFolderId).map(f => f.id));
  const isHome = !route.id && !route.view;
  const canCreate = useCanCreate();
  const create = useContext(CreateContext);
  const busy = useIsFetching() > 0;

  return (
    <nav className="sidebar" data-open={open} aria-label={appName}>
      <div className="sidebar-top">
        <Brand />
      </div>

      <div className="nav-group">
        <SearchButton onSearch={() => onSearch()} />
        <Link to={{}} className="nav-item" aria-current={isHome ? 'page' : undefined}>
          <HomeIcon /> {t('navHome')}
        </Link>
        <Link to={{ view: 'starred' }} className="nav-item" aria-current={route.view === 'starred' ? 'page' : undefined}>
          <StarIcon /> {t('navStarred')}
          {favorites.length > 0 && <span className="nav-count">{favorites.length}</span>}
        </Link>
      </div>

      <div className="nav-section">
        <div className="nav-label">
          {t('navSpaces')}
          {canCreate && (
            <button type="button" className="tree-action" aria-label={t('newSpace')} title={t('newSpace')} onClick={() => create({ parent: { id: root.id }, kind: 'folder' })}>
              <PlusIcon size={14} />
            </button>
          )}
        </div>
        {folders ? (
          <ul className="tree">
            {folders.children(root.id).map(folder => (
              <TreeNode key={folder.id} folder={folder} depth={0} index={folders} activeId={route.id} openIds={openIds} onSearch={onSearch} />
            ))}
          </ul>
        ) : (
          <div className="nav-group" style={{ padding: '6px 8px', gap: 14 }}>
            {[70, 55, 80, 45].map(w => <span key={w} className="skeleton" style={{ width: `${w}%` }} />)}
          </div>
        )}
      </div>

      <div className="nav-foot">
        <Account onShortcuts={onShortcuts} up showName />
        {busy && <span className="status" aria-live="polite" title={t('syncing')} />}
        <ThemeToggle />
      </div>
    </nav>
  );
}

/** The folder path as a breadcrumb, starting from Home. */
export function Crumbs({ folderId, current }: { folderId?: string; current?: string }) {
  const t = useT();
  const folders = useFolders().data;
  const path = folders?.path(folderId) ?? [];
  return (
    <ol className="crumbs" aria-label={t('breadcrumb')}>
      {path.length === 0 && <li><Link to={{}}>{t('navHome')}</Link></li>}
      {path.map((folder, i) => (
        <Fragment key={folder.id}>
          {i > 0 && <li aria-hidden="true">/</li>}
          <li>
            <Link to={{ id: folder.id }}>{folder.name}</Link>
          </li>
        </Fragment>
      ))}
      {current && (
        <>
          <li aria-hidden="true">/</li>
          <li aria-current="page" className="truncate">{current}</li>
        </>
      )}
    </ol>
  );
}

/** The bar above a page's content: where you are on the left, what you can do on the right. */
export function Topbar({ children, actions, notice }: { children?: React.ReactNode; actions?: React.ReactNode; notice?: React.ReactNode }) {
  return (
    <div className="pagebar">
      {children}
      {actions && <div className="pagebar-actions">{actions}</div>}
      {notice}
    </div>
  );
}
