/**
 * Google sign-in with the Google Identity Services token model.
 *
 * There is no backend, so the browser holds a short-lived access token (about an
 * hour) and nothing else. When it expires, the next Drive call returns 401, the
 * session is dropped and the user clicks "Continue" once; because the OAuth grant
 * already exists Google completes that without showing a consent screen.
 */
const GIS_SRC = 'https://accounts.google.com/gsi/client';
const STORAGE_KEY = 'gwiki.session';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.readonly';
/** Only requested when the deployment enables editing; creating inside existing folders needs full Drive access. */
const DRIVE_WRITE_SCOPE = 'https://www.googleapis.com/auth/drive';

export const scopes = (editing: boolean) =>
  [
    'openid',
    'email',
    'profile',
    DRIVE_SCOPE,
    // Only reaches the app's own hidden per-user folder, used for favourites.
    'https://www.googleapis.com/auth/drive.appdata',
    ...(editing ? [DRIVE_WRITE_SCOPE] : []),
  ].join(' ');

export interface Session {
  accessToken: string;
  expiresAt: number;
  email: string;
  name?: string;
  picture?: string;
  /** The user granted edit access, so the app may create pages and folders. */
  canEdit?: boolean;
}

/** A sign-in failure; `code` maps to the UI copy shown for it. */
export class AuthError extends Error {
  constructor(readonly code: 'authLoadFailed' | 'authCancelled' | 'authDriveScope' | 'authUnverified' | 'authWrongDomain' | 'authProfile') {
    super(code);
    this.name = 'AuthError';
  }
}

/* ----------------------------- session store ----------------------------- */

const listeners = new Set<() => void>();

function readStored(): Session | null {
  try {
    const session = JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null') as Session | null;
    return session && session.expiresAt > Date.now() + 60_000 ? session : null;
  } catch {
    return null;
  }
}

let current: Session | null = readStored();

function setSession(session: Session | null) {
  current = session;
  if (session) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  else sessionStorage.removeItem(STORAGE_KEY);
  listeners.forEach(fn => fn());
}

export const getSession = () => current;
export const signOut = () => setSession(null);
export const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};

/* ------------------------------- GIS client ------------------------------ */

let gisReady: Promise<void> | undefined;

/** Loads the GIS script once. Call early: sign-in must run synchronously from a click. */
export function loadGis(): Promise<void> {
  gisReady ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisReady = undefined;
      reject(new AuthError('authLoadFailed'));
    };
    document.head.appendChild(script);
  });
  return gisReady;
}

interface UserInfo {
  email?: string;
  email_verified?: boolean;
  hd?: string;
  name?: string;
  picture?: string;
}

async function fetchUser(accessToken: string): Promise<UserInfo> {
  const res = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) throw new AuthError('authProfile');
  return res.json();
}

/**
 * Opens Google's sign-in popup. Must be called directly from a click handler, after
 * `loadGis()` has resolved, or the browser blocks the popup.
 */
export function signIn(clientId: string, allowedDomain?: string, editing = false): Promise<Session> {
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: scopes(editing),
      // Narrows the account chooser; the `hd` check below is what enforces it.
      hd: allowedDomain,
      prompt: '',
      error_callback: () => reject(new AuthError('authCancelled')),
      callback: async response => {
        try {
          if (response.error) throw new AuthError('authCancelled');
          if (!google.accounts.oauth2.hasGrantedAllScopes(response, DRIVE_SCOPE)) {
            throw new AuthError('authDriveScope');
          }

          const user = await fetchUser(response.access_token);
          if (!user.email || user.email_verified !== true) {
            throw new AuthError('authUnverified');
          }
          if (allowedDomain && user.hd?.toLowerCase() !== allowedDomain) {
            throw new AuthError('authWrongDomain');
          }

          const session: Session = {
            accessToken: response.access_token,
            expiresAt: Date.now() + Number(response.expires_in) * 1000,
            email: user.email,
            name: user.name,
            picture: user.picture,
            // Google lets people untick individual permissions; without this one the wiki stays read-only.
            canEdit: editing && google.accounts.oauth2.hasGrantedAllScopes(response, DRIVE_WRITE_SCOPE),
          };
          setSession(session);
          resolve(session);
        } catch (e) {
          reject(e instanceof AuthError ? e : new AuthError('authProfile'));
        }
      },
    });
    client.requestAccessToken();
  });
}
