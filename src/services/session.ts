import { User } from '../types';
import {
  DEMO_SHORTHAND_USER_ID,
  authenticate,
  getUserById,
  getUsers,
} from './userStore';
import { notifyStorageChange } from './storage';

/**
 * Who is signed in, for this tab.
 *
 * Held in sessionStorage rather than localStorage, because being signed in is
 * a session and not saved data: kept in localStorage it survived closing the
 * browser, which on a shared branch tablet left the last inspector's account
 * open for whoever picked it up next. A reload inside the same tab keeps you
 * signed in, which is the point — it is closing the app that signs you out.
 *
 * Only the user's id is stored. The account itself is read back from the user
 * store every time, so an account edited or withdrawn while someone is signed
 * in takes effect on their next navigation rather than at their next sign-in.
 */

const KEY = 'inspection_log_session_v1';

/**
 * Keys an earlier build wrote.
 *
 * `inspection_log_auth` was a bare boolean with no user behind it, and it was
 * written to localStorage first, where it never expired. Neither can be
 * honoured now that a session names an account, so both are dropped once on
 * load and whoever was carrying one lands on sign-in.
 */
const LEGACY_KEYS = ['inspection_log_auth'];

if (typeof window !== 'undefined') {
  for (const key of LEGACY_KEYS) {
    try {
      localStorage.removeItem(key);
      sessionStorage.removeItem(key);
    } catch {
      // Storage unavailable (private mode, blocked cookies) — nothing to clear
    }
  }
}

/**
 * The demo shorthand.
 *
 * `123` / `123` signs in as the main admin. It predates accounts and is kept
 * deliberately: it is what everyone who has been shown this app already
 * types. The real addresses in the user store work alongside it.
 */
const SHORTHAND = '123';

export function currentUserId(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * The signed-in account, or null.
 *
 * Returns null for a session naming an account that has since been withdrawn
 * or deleted, so a revoked account cannot keep using an open tab.
 */
export function currentUser(): User | null {
  const id = currentUserId();
  if (!id) return null;
  const user = getUserById(id);
  return user && user.active ? user : null;
}

export function isAuthenticated(): boolean {
  return currentUser() !== null;
}

export interface SignInResult {
  ok: boolean;
  user?: User;
  /** Why it was refused, ready to show. */
  error?: string;
}

export function signIn(email: string, password: string): SignInResult {
  const isShorthand = email.trim() === SHORTHAND && password.trim() === SHORTHAND;
  const user = isShorthand
    ? getUsers().find((u) => u.id === DEMO_SHORTHAND_USER_ID && u.active) ?? null
    : authenticate(email, password);

  if (!user) return { ok: false, error: 'Incorrect email or password' };

  try {
    sessionStorage.setItem(KEY, user.id);
  } catch (err) {
    console.error('Failed to start the session:', err);
    return { ok: false, error: 'Could not sign in — storage is unavailable in this browser' };
  }

  notifyStorageChange();
  return { ok: true, user };
}

export function signOut(): void {
  try {
    sessionStorage.removeItem(KEY);
  } catch (err) {
    console.error('Failed to end the session:', err);
  }
  notifyStorageChange();
}

/**
 * Signs in as a given account without a password.
 *
 * For the role switcher on the sign-in screen, which exists so the system can
 * be shown as each role in turn without a list of passwords to hand. It is
 * demo scaffolding and has no business existing once accounts are real — it
 * is the one thing in this file a backend would not have an equivalent of.
 */
export function signInAs(userId: string): SignInResult {
  const user = getUserById(userId);
  if (!user || !user.active) return { ok: false, error: 'That account is not available' };

  try {
    sessionStorage.setItem(KEY, user.id);
  } catch (err) {
    console.error('Failed to start the session:', err);
    return { ok: false, error: 'Could not sign in — storage is unavailable in this browser' };
  }

  notifyStorageChange();
  return { ok: true, user };
}
