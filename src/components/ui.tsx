import { useEffect } from 'react';
import { MIME, resolveTarget, DriveError, type DriveFile } from '../google/drive';
import { useFolders, usePathLabel, useT } from '../lib/data';
import { timeAgo } from '../lib/format';
import { href, navigate, type Route } from '../lib/route';
import { DocIcon, FolderIcon, ImageIcon, SheetIcon, SlidesIcon, VideoIcon } from './icons';

/** A three-letter type code, the wiki's one visual vocabulary for file kinds. */
export function kindOf(mimeType: string): string {
  if (mimeType === MIME.folder) return 'DIR';
  if (mimeType === MIME.doc) return 'DOC';
  if (mimeType === MIME.sheet || mimeType === 'text/csv') return 'SHT';
  if (mimeType === MIME.slides) return 'SLD';
  if (mimeType === 'application/pdf') return 'PDF';
  if (mimeType.startsWith('image/')) return 'IMG';
  if (mimeType.startsWith('video/')) return 'VID';
  return 'FILE';
}

const KIND_ICONS: Record<string, (p: { size?: number }) => React.JSX.Element> = {
  DIR: FolderIcon,
  SHT: SheetIcon,
  SLD: SlidesIcon,
  IMG: ImageIcon,
  VID: VideoIcon,
};

/** A file's type as a small coloured icon tile. */
export const Kind = ({ mimeType, size = 15 }: { mimeType: string; size?: number }) => {
  const kind = kindOf(mimeType);
  const Icon = KIND_ICONS[kind] ?? DocIcon;
  return <span className="kind" data-kind={kind} title={kind}><Icon size={size} /></span>;
};

/** A stable hue per name, so each space keeps its colour without any configuration. */
export function hueOf(name: string): number {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % 360;
}

/** A space's colour as a `--space` variable: its Drive folder colour, or a stable one from its name. */
export const spaceStyle = (space: { name: string; color?: string }) =>
  ({ '--space': space.color ?? `hsl(${hueOf(space.name)} 55% 48%)` }) as React.CSSProperties;

/** A space's lettered tile, in the space's colour. */
export const SpaceAvatar = ({ space, size = 'md' }: { space: { name: string; color?: string }; size?: 'sm' | 'md' | 'lg' | 'xl' }) => (
  <span className="space-avatar" data-size={size} style={spaceStyle(space)} aria-hidden="true">
    {space.name.trim().charAt(0).toUpperCase()}
  </span>
);

/** A person's initials in a circle. */
export const Avatar = ({ name, src }: { name: string; src?: string }) =>
  src ? <img className="avatar" src={src} alt="" referrerPolicy="no-referrer" /> : (
    <span className="avatar" style={{ '--hue': hueOf(name) } as React.CSSProperties} aria-hidden="true">{initials(name)}</span>
  );

/** An in-app link: a real `<a href>` for new tabs and accessibility, routed client-side. */
export function Link({ to, className, children, onClick, ...rest }: { to: Route; className?: string; children: React.ReactNode } & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href'>) {
  return (
    <a
      {...rest}
      href={href(to)}
      className={className}
      onClick={e => {
        onClick?.(e);
        if (e.defaultPrevented) return;
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}

type RowFile = Pick<DriveFile, 'id' | 'name' | 'mimeType'> & Partial<DriveFile>;

/** Files as a table: title, where it lives (optional), who edited it last, and when. */
export function FileList({ files, empty, showPath = true }: { files: RowFile[]; empty: string; showPath?: boolean }) {
  const t = useT();
  const pathLabel = usePathLabel();
  const index = useFolders().data;
  if (files.length === 0) return <div className="empty">{empty}</div>;
  return (
    <table className="ftable">
      <thead>
        <tr>
          <th>{t('colTitle')}</th>
          {showPath && <th className="col-space">{t('colLocation')}</th>}
          <th className="col-who">{t('colEditedBy')}</th>
          <th className="col-time">{t('colUpdated')}</th>
        </tr>
      </thead>
      <tbody>
        {files.map(file => {
          const target = resolveTarget(file as DriveFile);
          const path = showPath ? pathLabel(file) : '';
          const space = index?.path(file.parents?.[0])[0];
          const editor = file.lastModifyingUser?.displayName;
          return (
            <tr key={file.id}>
              <td>
                <Link to={{ id: target.id }} className="cell-title">
                  <Kind mimeType={target.mimeType} />
                  <span>
                    <span>{file.name}</span>
                    <span className="cell-sub">{[path, editor].filter(Boolean).join(' · ')}</span>
                  </span>
                </Link>
              </td>
              {showPath && (
                <td className="col-space">
                  {path && <span className="cell-with">{space && <span className="dot" style={spaceStyle(space)} />}<span>{path}</span></span>}
                </td>
              )}
              <td className="col-who">
                {editor && <span className="cell-with"><Avatar name={editor} src={file.lastModifyingUser?.photoLink} /><span>{editor}</span></span>}
              </td>
              <td className="col-time">{file.modifiedTime && <time dateTime={file.modifiedTime}>{timeAgo(file.modifiedTime)}</time>}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export const ListSkeleton = ({ rows = 5 }: { rows?: number }) => (
  <div className="list" aria-busy="true">
    {Array.from({ length: rows }, (_, i) => (
      <div className="row" key={i}>
        <span className="kind" />
        <span className="row-main"><span className="skeleton" style={{ width: `${40 + ((i * 17) % 40)}%` }} /></span>
      </div>
    ))}
  </div>
);

export function ErrorNotice({ error }: { error: unknown }) {
  const t = useT();
  const message =
    error instanceof DriveError && error.status === 404 ? t('errorNotFound')
    : error instanceof DriveError && error.status === 403 ? t('errorForbidden')
    : error instanceof DriveError && error.status === 429 ? t('errorRateLimited')
    : t('errorGeneric');
  return (
    <div className="alert" role="alert">
      <strong>{t('errorTitle')}</strong>
      {message}
    </div>
  );
}

/** Closes a popup menu on a click outside `ref`. */
export function useDismiss(ref: React.RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && close();
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [ref, open, close]);
}

/** The app's logo, or a monogram of its name. */
export function BrandMark({ name, logoUrl }: { name: string; logoUrl?: string }) {
  if (logoUrl) return <img src={logoUrl} alt={name} />;
  return <span className="monogram" aria-hidden="true">{name.trim().charAt(0).toUpperCase()}</span>;
}

export const initials = (name: string) =>
  name
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('');
