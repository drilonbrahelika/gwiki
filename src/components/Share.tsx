import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { DriveFile } from '../google/drive';
import { useT } from '../lib/data';
import { href } from '../lib/route';
import { CheckIcon, HashIcon, LinkIcon, MailIcon, ShareIcon, UsersIcon } from './icons';
import { useDismiss } from './ui';

/** The address of a page (and optionally one of its sections) that anyone can paste. */
export const pageUrl = (id: string, section?: string) => new URL(href({ id }), location.origin).href + (section ? `#${section}` : '');

/** Copies text and reports success for a moment, so a button can say "Copied". */
export function useCopy(ms = 1600) {
  const [copied, setCopied] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = useCallback(
    (text: string, key = text) =>
      navigator.clipboard.writeText(text).then(() => {
        setCopied(key);
        clearTimeout(timer.current);
        timer.current = setTimeout(() => setCopied(undefined), ms);
      }),
    [ms],
  );
  return { copied, copy };
}

/** One click: the page's link on the clipboard, confirmed on the button and in a toast. */
export function CopyLinkButton({ file }: { file: DriveFile }) {
  const t = useT();
  const { copied, copy } = useCopy();
  const label = copied ? t('linkCopied') : t('copyPageLink');
  return (
    <>
      <button type="button" className="icon-button" data-done={!!copied} aria-label={label} title={label} onClick={() => copy(pageUrl(file.id))}>
        {copied ? <CheckIcon size={17} /> : <LinkIcon size={17} />}
      </button>
      {copied && <div className="toast" role="status">{t('linkCopied')}</div>}
    </>
  );
}

/** Share: the link to copy, a link to the section being read, email, the system share sheet, and Drive access. */
export function ShareMenu({ file, section }: { file: DriveFile; section?: { id: string; text: string } }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const { copied, copy } = useCopy();
  const close = useCallback(() => setOpen(false), []);
  useDismiss(ref, open, close);
  const url = pageUrl(file.id);
  const isFolder = file.mimeType === 'application/vnd.google-apps.folder';
  const canNativeShare = typeof navigator.share === 'function';

  return (
    <div className="account" ref={ref} onKeyDown={e => e.key === 'Escape' && setOpen(false)}>
      <button type="button" className="button" aria-haspopup="dialog" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ShareIcon size={15} /> <span>{t('share')}</span>
      </button>
      {open && (
        <div className="menu share" role="dialog" aria-labelledby={titleId}>
          <strong id={titleId}>{t(isFolder ? 'shareFolderTitle' : 'shareTitle')}</strong>
          <div className="share-link">
            <input readOnly value={url} aria-label={t('pageLink')} onFocus={e => e.currentTarget.select()} />
            <button type="button" className="button button-primary" onClick={() => copy(url, 'page')}>
              {copied === 'page' ? t('copied') : t('copy')}
            </button>
          </div>
          <div className="share-actions">
            {section && (
              <button type="button" className="menu-item" onClick={() => copy(pageUrl(file.id, section.id), 'section')}>
                {copied === 'section' ? <CheckIcon size={16} /> : <HashIcon size={16} />}
                <span>{copied === 'section' ? t('linkCopied') : t('copyCurrentSection')}</span>
                <span className="menu-hint truncate">{section.text}</span>
              </button>
            )}
            <a className="menu-item" href={`mailto:?subject=${encodeURIComponent(file.name)}&body=${encodeURIComponent(url)}`}>
              <MailIcon size={16} /> {t('emailPage')}
            </a>
            {canNativeShare && (
              <button type="button" className="menu-item" onClick={() => navigator.share({ title: file.name, url }).catch(() => {})}>
                <ShareIcon size={16} /> {t('shareVia')}
              </button>
            )}
            {file.webViewLink && (
              <a className="menu-item" href={file.webViewLink} target="_blank" rel="noopener noreferrer">
                <UsersIcon size={16} /> {t('manageAccess')}
              </a>
            )}
          </div>
          <p className="share-note">{t('shareNote')}</p>
        </div>
      )}
    </div>
  );
}
