import { useSyncExternalStore } from 'react';

/**
 * Light or dark, per reader. "system" follows the OS and is the default; a choice is
 * remembered in this browser only. The result is `data-theme` on <html>, which the
 * stylesheet keys its dark palette on.
 */
export type ThemeMode = 'light' | 'dark' | 'system';

const STORAGE_KEY = 'gwiki.theme';
const media = typeof matchMedia === 'function' ? matchMedia('(prefers-color-scheme: dark)') : undefined;
const listeners = new Set<() => void>();

function stored(): ThemeMode {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

let mode = stored();

export const resolvedTheme = (): 'light' | 'dark' => (mode === 'system' ? (media?.matches ? 'dark' : 'light') : mode);

export function applyTheme() {
  document.documentElement.dataset.theme = resolvedTheme();
  listeners.forEach(fn => fn());
}

media?.addEventListener('change', () => mode === 'system' && applyTheme());

export function setThemeMode(next: ThemeMode) {
  mode = next;
  try {
    if (next === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // Private windows may refuse storage; the choice then lasts for this page only.
  }
  applyTheme();
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

export function useTheme() {
  return {
    mode: useSyncExternalStore(subscribe, () => mode),
    resolved: useSyncExternalStore(subscribe, resolvedTheme),
  };
}
