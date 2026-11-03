import type { Root } from './google/drive';
import { DEFAULT_MESSAGES, RETIRED_MESSAGES, type Messages } from './messages';

/**
 * Runtime configuration, read from `/config.json` at startup.
 *
 * Every brand-specific value lives here rather than in the bundle, so one build
 * can be deployed for any number of organisations by swapping this file.
 */
export interface AppConfig {
  /** Shown in the sidebar, the sign-in screen and the browser tab. */
  appName: string;
  /** Optional logo; a monogram of the app name is shown when empty. */
  logoUrl?: string;
  /** Optional favicon; the bundled neutral icon is used when empty. */
  faviconUrl?: string;
  /** OAuth 2.0 Web client id from Google Cloud Console. */
  googleClientId: string;
  /** What the wiki is built from: a Shared Drive (`sharedDriveId`) or any folder (`rootFolderId`). */
  root: Root;
  /** Restricts sign-in to one Google Workspace domain, e.g. `example.com`. */
  allowedDomain?: string;
  /** Optional "Get help" link. */
  supportUrl?: string;
  /** Design tokens, applied as CSS custom properties over the defaults in styles.css. */
  theme: Partial<Record<ThemeToken, string>>;
  /** Tokens for dark mode, over the built-in dark palette; `theme.accent` carries over unless set here. */
  themeDark: Partial<Record<ThemeToken, string>>;
  /** Stylesheet that loads the theme's fonts (https only). */
  fontsUrl?: string;
  /** UI copy; any key left out falls back to the default wording. */
  messages: Messages;
  /** Lets people create pages and folders from the app. Asks for Drive edit access at sign-in. */
  editing: boolean;
  /** A folder of Google Docs offered as templates for new pages. */
  templatesFolderId?: string;
  /** Pages untouched for this many days are flagged as possibly out of date; 0 turns it off. */
  staleAfterDays: number;
}

/** Theme keys and the CSS custom property each one sets. */
export const THEME_TOKENS = {
  accent: '--accent',
  accentContrast: '--accent-contrast',
  ink: '--ink',
  inkMuted: '--ink-2',
  inkSubtle: '--ink-3',
  canvas: '--canvas',
  surface: '--surface',
  sidebar: '--sidebar',
  sidebarInk: '--sidebar-ink',
  line: '--line',
  inverse: '--inverse',
  inverseInk: '--inverse-ink',
  success: '--success',
  danger: '--danger',
  fontSans: '--font-sans',
  fontDisplay: '--font-display',
  fontMono: '--font-mono',
  fontReading: '--font-reading',
  radius: '--radius',
} as const;

export type ThemeToken = keyof typeof THEME_TOKENS;

export class ConfigError extends Error {}

/** Characters that could end a CSS declaration early. */
const UNSAFE_CSS = /[;{}<>\\]/;

const isHttpsOrPath = (url: string) => url.startsWith('/') || url.startsWith('https://');

export function parseConfig(raw: unknown): AppConfig {
  if (!raw || typeof raw !== 'object') throw new ConfigError('config.json must be a JSON object.');
  const c = raw as Record<string, unknown>;
  const str = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const obj = (value: unknown) => (value && typeof value === 'object' ? (value as Record<string, unknown>) : {});

  if (!str(c.googleClientId)) throw new ConfigError('config.json is missing: googleClientId.');
  const driveId = str(c.sharedDriveId);
  const folderId = str(c.rootFolderId);
  if (!driveId === !folderId) throw new ConfigError('config.json needs exactly one of sharedDriveId or rootFolderId.');
  const root: Root = driveId ? { kind: 'drive', id: driveId } : { kind: 'folder', id: folderId };

  const tokens = (raw: unknown, label: string) => {
    const out: AppConfig['theme'] = {};
    for (const [key, value] of Object.entries(obj(raw))) {
      if (!(key in THEME_TOKENS)) throw new ConfigError(`Unknown ${label} key "${key}".`);
      const v = str(value);
      if (!v) continue;
      if (UNSAFE_CSS.test(v)) throw new ConfigError(`${label}.${key} contains characters that are not allowed.`);
      out[key as ThemeToken] = v;
    }
    return out;
  };
  const theme = tokens(c.theme, 'theme');
  const themeDark = tokens(c.themeDark, 'themeDark');

  const messages = { ...DEFAULT_MESSAGES };
  for (const [key, value] of Object.entries(obj(c.messages))) {
    if (RETIRED_MESSAGES.has(key)) continue;
    if (!(key in DEFAULT_MESSAGES)) throw new ConfigError(`Unknown message key "${key}".`);
    if (str(value)) messages[key as keyof Messages] = str(value);
  }

  const urls = { logoUrl: str(c.logoUrl), faviconUrl: str(c.faviconUrl), fontsUrl: str(c.fontsUrl), supportUrl: str(c.supportUrl) };
  for (const [key, url] of Object.entries(urls)) {
    if (url && !isHttpsOrPath(url)) throw new ConfigError(`${key} must be an https:// URL or a path.`);
  }

  return {
    appName: str(c.appName) || messages.defaultAppName,
    googleClientId: str(c.googleClientId),
    root,
    allowedDomain: str(c.allowedDomain).toLowerCase() || undefined,
    logoUrl: urls.logoUrl || undefined,
    faviconUrl: urls.faviconUrl || undefined,
    fontsUrl: urls.fontsUrl || undefined,
    supportUrl: urls.supportUrl || undefined,
    theme,
    themeDark,
    messages,
    editing: c.editing === true,
    templatesFolderId: str(c.templatesFolderId) || undefined,
    staleAfterDays: typeof c.staleAfterDays === 'number' && c.staleAfterDays >= 0 ? c.staleAfterDays : 180,
  };
}

export async function loadConfig(): Promise<AppConfig> {
  const res = await fetch(`${import.meta.env.BASE_URL}config.json`, { cache: 'no-store' });
  if (!res.ok) throw new ConfigError(`Could not load config.json (HTTP ${res.status}).`);
  // A host that answers every path with index.html (the dev server, many SPA hosts) means the file is missing.
  const text = await res.text();
  if (text.trimStart().startsWith('<')) throw new ConfigError('No config.json found. Copy config.example.json to config.json and fill it in.');
  try {
    return parseConfig(JSON.parse(text));
  } catch (error) {
    throw error instanceof ConfigError ? error : new ConfigError('config.json is not valid JSON.');
  }
}

/** Applies the brand to the document: tokens, fonts, title and favicon. */
export function applyBrand(config: AppConfig) {
  // A stylesheet rather than inline styles, so the dark palette can still override the light brand
  // tokens. Values were checked in parseConfig and cannot break out of a declaration.
  const declarations = (tokens: AppConfig['theme']) =>
    Object.entries(tokens).map(([key, value]) => `${THEME_TOKENS[key as ThemeToken]}:${value};`).join('');
  const style = document.createElement('style');
  style.textContent = `:root{${declarations(config.theme)}}:root[data-theme='dark']{${declarations(config.themeDark)}}`;
  document.head.appendChild(style);
  if (config.fontsUrl) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = config.fontsUrl;
    document.head.appendChild(link);
  }
  if (config.faviconUrl) {
    document.querySelector<HTMLLinkElement>('link[rel="icon"]')?.setAttribute('href', config.faviconUrl);
  }
  document.title = config.appName;
}
