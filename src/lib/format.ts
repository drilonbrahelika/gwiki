const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto', style: 'short' });

/** "3 hours ago", "yesterday", "last week". */
export function timeAgo(iso: string | undefined, now = Date.now()): string {
  if (!iso) return '';
  const seconds = (new Date(iso).getTime() - now) / 1000;
  if (Number.isNaN(seconds)) return '';
  for (const [unit, size] of UNITS) {
    if (Math.abs(seconds) >= size) return rtf.format(Math.round(seconds / size), unit);
  }
  return rtf.format(0, 'second');
}

/** A precise, locale-formatted timestamp for detail panels. */
export const dateTime = (iso: string | undefined) =>
  iso ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso)) : '';

/** Whether a timestamp is more than `days` days in the past. */
export const olderThan = (iso: string | undefined, days: number, now = Date.now()) =>
  !!iso && now - new Date(iso).getTime() > days * 86_400_000;
