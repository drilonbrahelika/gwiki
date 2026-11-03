import { useEffect, useId, useRef } from 'react';
import { useT } from '../lib/data';
import { navigate } from '../lib/route';
import type { MessageKey } from '../messages';

/** Every shortcut, as listed in the help dialog. Single keys only fire outside text fields. */
const SHORTCUTS: { keys: string[]; or?: string; label: MessageKey }[] = [
  { keys: ['⌘', 'K'], or: '/', label: 'scSearch' },
  { keys: ['G', 'H'], label: 'scHome' },
  { keys: ['G', 'S'], label: 'scStarred' },
  { keys: ['N'], label: 'scNew' },
  { keys: ['?'], label: 'scHelp' },
  { keys: ['Esc'], label: 'scClose' },
];

/** How long after "g" the second key of a "g h" sequence still counts. */
const SEQUENCE_MS = 1000;

export interface ShortcutActions {
  search: () => void;
  help: () => void;
  /** Missing where a new page can't be made, e.g. on Home or without edit access. */
  newPage?: () => void;
}

export function useShortcuts(actions: ShortcutActions) {
  // The listener is registered once; it always calls the latest actions.
  const latest = useRef(actions);
  useEffect(() => {
    latest.current = actions;
  });

  useEffect(() => {
    let gAt = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        latest.current.search();
        return;
      }
      const typing = e.target instanceof HTMLElement && e.target.matches('input, textarea, select, [contenteditable]');
      if (typing || e.metaKey || e.ctrlKey || e.altKey || document.querySelector('[aria-modal="true"]')) return;

      const afterG = e.timeStamp - gAt < SEQUENCE_MS;
      gAt = 0;
      const key = e.key.toLowerCase();
      if (afterG && key === 'h') navigate({});
      else if (afterG && key === 's') navigate({ view: 'starred' });
      else if (key === 'g') gAt = e.timeStamp;
      else if (key === '/') latest.current.search();
      else if (key === '?') latest.current.help();
      else if (key === 'n' && latest.current.newPage) latest.current.newPage();
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

export function ShortcutsDialog({ onClose }: { onClose: () => void }) {
  const t = useT();
  const titleId = useId();
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => close.current?.focus(), []);

  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={e => e.key === 'Escape' && onClose()}>
        <h2 id={titleId}>{t('shortcuts')}</h2>
        <dl className="shortcuts">
          {SHORTCUTS.map(s => (
            <div key={s.keys.join('+')}>
              <dt>{t(s.label)}</dt>
              <dd>
                {s.keys.map(k => <kbd key={k}>{k}</kbd>)}
                {s.or && <>{' '}<span>{t('or')}</span> <kbd>{s.or}</kbd></>}
              </dd>
            </div>
          ))}
        </dl>
        <div className="dialog-actions">
          <button ref={close} type="button" className="button" onClick={onClose}>{t('done')}</button>
        </div>
      </div>
    </div>
  );
}
