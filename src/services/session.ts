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
 * Whether the two password-free ways in are open.
 *
 * Off unless `NEXT_PUBLIC_DEMO_SIGN_IN=true` was set when the app was built.
 * Both of them — the `123` shorthand and the role switcher — sign somebody in
 * as the main admin without a password, which is exactly what you want while
 * showing the system and exactly what must not exist once it is holding a real
 * estate's records: anyone who can open the URL would have full control of it.
 *
 * A build-time flag rather than a runtime setting on purpose: a setting would
 * live in the same browser store the accounts do, so whoever could switch it
 * on is already past the door it guards. Inlined at build time, both doors are
 * refused by code that cannot be reached back through the UI.
 *
 * It closes the doors, it does not strip them: the switcher's markup is still
 * in the bundle as dead code, because the constant crosses a module boundary
 * and the minifier will not fold it that far. That costs a few hundred bytes
 * and nothing else — `signInAs` refuses before it looks anything up, so there
 * is no path back to it from a page that no longer draws the button.
 */
export const DEMO_SIGN_IN_ENABLED = process.env.NEXT_PUBLIC_DEMO_SIGN_IN === 'true';

/**
 * The demo shorthand.
 *
 * `123` / `123` signs in as the main admin. It predates accounts and is what
 * everyone who has been shown this app already types — so it is kept, behind
 * `DEMO_SIGN_IN_ENABLED`. The real addresses in the user store work either way.
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
  const isShorthand =
    DEMO_SIGN_IN_ENABLED && email.trim() === SHORTHAND && password.trim() === SHORTHAND;
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
  /*
   * Refused outright rather than left to the screen to hide. The button is
   * gone in a production build, but a function that signs anybody in as the
   * admin should not be one call away from anything that can reach the module.
   */
  if (!DEMO_SIGN_IN_ENABLED) {
    return { ok: false, error: 'Sign in with your email address and password' };
  }

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
