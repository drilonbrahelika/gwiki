import { useSyncExternalStore } from 'react';

/**
 * Pages this reader opened recently, newest first, kept in this browser only.
 * Home offers them as "Recently visited"; nothing leaves the device.
 */
export interface Visit {
  id: string;
  name: string;
  mimeType: string;
  parents?: string[];
  /** When it was opened, in milliseconds since the epoch. */
  at?: number;
}

const STORAGE_KEY = 'gwiki.history';
const LIMIT = 8;
const listeners = new Set<() => void>();

function read(): Visit[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(value) ? value.filter((v): v is Visit => typeof v?.id === 'string' && typeof v?.name === 'string') : [];
  } catch {
    return [];
  }
}

let visits = read();

export function recordVisit(visit: Visit) {
  if (visits[0]?.id === visit.id && visits[0].name === visit.name) return;
  visit = { ...visit, at: Date.now() };
  visits = [visit, ...visits.filter(v => v.id !== visit.id)].slice(0, LIMIT);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(visits));
  } catch {
    // Storage may be refused (private windows); the list then lasts for this page only.
  }
  listeners.forEach(fn => fn());
}

/** Forgets everything, e.g. when the reader signs out. */
export function clearVisits() {
  visits = [];
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing stored.
  }
  listeners.forEach(fn => fn());
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

export const useVisits = () => useSyncExternalStore(subscribe, () => visits);
