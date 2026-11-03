import { useEffect, useId, useRef, useState } from 'react';
import { MIME, resolveTarget } from '../google/drive';
import { useFolders, usePathLabel, useRecent, useSearch, useT } from '../lib/data';
import { navigate } from '../lib/route';
import { CloseIcon, SearchIcon } from './icons';
import { Kind } from './ui';
import type { MessageKey } from '../messages';

const FILTERS: { key: MessageKey; types: readonly string[] }[] = [
  { key: 'filterAll', types: [] },
  { key: 'filterDocs', types: [MIME.doc] },
  { key: 'filterSheets', types: [MIME.sheet] },
  { key: 'filterSlides', types: [MIME.slides] },
  { key: 'filterPdfs', types: ['application/pdf'] },
];

function useDebounced<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return debounced;
}

/** The ⌘K command palette: type, filter, arrow through results, Enter to open. `scopeId` limits it to one space. */
export function Palette({ scopeId, onClose }: { scopeId?: string; onClose: () => void }) {
  const t = useT();
  const [scope, setScope] = useState(scopeId);
  const folders = useFolders().data;
  const space = folders?.get(scope ?? '')?.name;
  const listId = useId();
  const pathLabel = usePathLabel();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState(0);
  const [selected, setSelected] = useState(0);
  const term = useDebounced(query.trim(), 200);
  const types = FILTERS[filter]?.types ?? [];
  const search = useSearch(term, types, scope);
  const recent = useRecent();
  // Before anything is typed, offer recent pages (in the chosen space and type) so search is also a jump list.
  const idle = term.length < 2;
  const inScope = scope && folders ? folders.subtree(scope) : undefined;
  const results = idle
    ? (recent.data ?? []).filter(f => (!types.length || types.includes(f.mimeType)) && (!inScope || inScope.has(f.parents?.[0] ?? ''))).slice(0, 6)
    : (search.data ?? []);
  const list = useRef<HTMLDivElement>(null);

  const open = (index: number) => {
    const file = results[index];
    if (!file) return;
    navigate({ id: resolveTarget(file).id });
    onClose();
  };

  useEffect(() => {
    list.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') setSelected(i => Math.min(i + 1, results.length - 1));
    else if (e.key === 'ArrowUp') setSelected(i => Math.max(i - 1, 0));
    else if (e.key === 'Enter') open(selected);
    else return;
    e.preventDefault();
  };

  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label={t('search')} onKeyDown={onKeyDown}>
        <label className="palette-input">
          <SearchIcon size={18} />
          <span className="sr-only">{t('search')}</span>
          <input
            autoFocus
            type="search"
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls={listId}
            aria-activedescendant={results[selected] ? `${listId}-${selected}` : undefined}
            placeholder={space ? t('searchSpace', { space }) : t('searchPlaceholder')}
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelected(0);
            }}
          />
          <kbd>esc</kbd>
        </label>

        <div className="chips" role="group" aria-label={t('fileType')}>
          {space && (
            <button type="button" className="chip chip-scope" aria-label={t('searchEverywhere')} title={t('searchEverywhere')} onClick={() => setScope(undefined)}>
              {t('searchIn', { space })} <CloseIcon size={12} />
            </button>
          )}
          {FILTERS.map((f, i) => (
            <button
              key={f.key}
              type="button"
              className="chip"
              aria-pressed={filter === i}
              onClick={() => {
                setFilter(i);
                setSelected(0);
              }}
            >
              {t(f.key)}
            </button>
          ))}
        </div>

        <div className="palette-results" id={listId} role="listbox" ref={list} aria-busy={search.isFetching}>
          {idle && results.length === 0 ? (
            <div className="palette-note">{space ? t('searchIdleIn', { space }) : t('searchIdle')}</div>
          ) : results.length === 0 && !search.isFetching ? (
            <div className="palette-note">{t('searchEmpty', { query: term })}</div>
          ) : (
            <>
              <div className="nav-label">{idle ? t('recentlyUpdated') : results.length === 1 ? t('result') : t('results', { count: results.length })}</div>
              {results.map((file, i) => (
                <div
                  key={file.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={i === selected}
                  className="option"
                  onMouseMove={() => setSelected(i)}
                  onClick={() => open(i)}
                >
                  <Kind mimeType={resolveTarget(file).mimeType} />
                  <span className="row-main">
                    <span className="row-title truncate">{file.name}</span>
                    <span className="row-path truncate">{pathLabel(file)}</span>
                  </span>
                  <kbd>↵</kbd>
                </div>
              ))}
            </>
          )}
        </div>

        <div className="palette-foot">
          <span><kbd>↑↓</kbd> {t('searchNavigate')}</span>
          <span><kbd>↵</kbd> {t('searchOpen')}</span>
          <span className="hide-sm">{t('searchFootnote')}</span>
        </div>
      </div>
    </div>
  );
}
