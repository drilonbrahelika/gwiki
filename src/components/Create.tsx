import { createContext, useContext, useId, useRef, useState } from 'react';
import { useConfig, useCreate, useSession, useT, useTemplates } from '../lib/data';
import { navigate } from '../lib/route';
import { DocIcon, FolderIcon, PlusIcon } from './icons';
import { useDismiss } from './ui';

export interface CreateRequest {
  parent: { id: string; name?: string };
  kind: 'page' | 'folder';
}

/** Opens the "new page / folder" dialog from anywhere in the app. */
export const CreateContext = createContext<(request: CreateRequest) => void>(() => {});

/** Whether this user may create pages: the deployment allows it and they granted edit access. */
export function useCanCreate() {
  const { editing } = useConfig();
  const session = useSession();
  return editing && !!session?.canEdit;
}

/** The "+ New" button on a folder page, with a menu for a page or a folder. */
export function NewMenu({ parent }: { parent: CreateRequest['parent'] }) {
  const t = useT();
  const open = useContext(CreateContext);
  const [menu, setMenu] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, menu, () => setMenu(false));
  const pick = (kind: CreateRequest['kind']) => {
    setMenu(false);
    open({ parent, kind });
  };

  return (
    <div className="account" ref={ref}>
      <button type="button" className="button button-primary" aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(!menu)}>
        <PlusIcon size={15} /> <span>{t('newItem')}</span>
      </button>
      {menu && (
        <div className="menu menu-compact" role="menu">
          <button type="button" role="menuitem" className="menu-item" onClick={() => pick('page')}><DocIcon size={15} /> {t('newPage')}</button>
          <button type="button" role="menuitem" className="menu-item" onClick={() => pick('folder')}><FolderIcon size={15} /> {t('newFolder')}</button>
        </div>
      )}
    </div>
  );
}

/**
 * Names a new page or folder and creates it in Drive. A page then opens in Google Docs
 * for writing, and the wiki shows it, ready to pick up the edits on return.
 */
export function CreateDialog({ parent, kind: initialKind, onClose }: CreateRequest & { onClose: () => void }) {
  const t = useT();
  const { root } = useConfig();
  const isSpace = parent.id === root.id;
  const [kind, setKind] = useState(isSpace ? 'folder' : initialKind);
  const [name, setName] = useState('');
  const [templateId, setTemplateId] = useState('');
  const templates = useTemplates().data ?? [];
  const create = useCreate();
  const titleId = useId();
  const isPage = kind === 'page';
  const title = isSpace ? t('newSpaceTitle') : t(isPage ? 'newPageIn' : 'newFolderIn', { folder: parent.name ?? '' });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // Opened during the click so the browser allows it; pointed at the new Doc once it exists.
    const tab = isPage ? window.open('', '_blank') : null;
    if (tab) tab.opener = null;
    create.mutate(
      { name: name.trim() || t(isPage ? 'untitledPage' : 'untitledFolder'), kind, parentId: parent.id, templateId: templateId || undefined },
      {
        onSuccess: file => {
          if (tab && file.webViewLink) tab.location.href = file.webViewLink;
          else tab?.close();
          navigate({ id: file.id });
          onClose();
        },
        onError: () => tab?.close(),
      },
    );
  };

  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <form className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onSubmit={submit} onKeyDown={e => e.key === 'Escape' && onClose()}>
        <h2 id={titleId}>{title}</h2>

        {!isSpace && (
          <div className="segmented" role="radiogroup">
            {(['page', 'folder'] as const).map(k => (
              <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}>
                {k === 'page' ? <DocIcon size={15} /> : <FolderIcon size={15} />} {t(k === 'page' ? 'newPage' : 'newFolder')}
              </button>
            ))}
          </div>
        )}

        <label className="field">
          <span>{t('nameLabel')}</span>
          <input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder={t(isPage ? 'untitledPage' : 'untitledFolder')} maxLength={200} />
        </label>

        {isPage && templates.length > 0 && (
          <fieldset className="field">
            <legend>{t('templateLabel')}</legend>
            <div className="templates">
              {[{ id: '', name: t('templateBlank') }, ...templates].map(template => (
                <label key={template.id} className="template">
                  <input type="radio" name="template" checked={templateId === template.id} onChange={() => setTemplateId(template.id)} />
                  <DocIcon size={15} />
                  <span className="truncate">{template.name}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {create.isError && <div className="alert" role="alert">{t('errorCreate')}</div>}

        <div className="dialog-actions">
          <button type="button" className="button button-quiet" onClick={onClose}>{t('cancel')}</button>
          <button type="submit" className="button button-primary" disabled={create.isPending}>
            {create.isPending ? t('creating') : isPage ? t('createAndEdit') : t('create')}
          </button>
        </div>
      </form>
    </div>
  );
}
