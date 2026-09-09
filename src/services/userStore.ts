import { BRANCHES, USER_ROLE_LABEL, User, UserRole, initialsOf } from '../types';
import { getInspections } from './storage';

/**
 * The accounts that can sign in.
 *
 * Held in storage rather than as a constant, because the admin manages these
 * from inside the app. `SEED_USERS` is only what an empty store starts from.
 *
 * There is no server, so passwords sit here in the clear. Nothing outside
 * this module reads `password` — sign-in goes through `authenticate` — so a
 * real backend replaces this file and leaves the rest of the app alone.
 *
 * Withdrawing an account deactivates it rather than deleting it: an
 * inspector's name stays on the visits they submitted, and a deleted id
 * would leave those records pointing at nothing. See `removeUser`.
 */

const KEY = 'inspection_log_users_v1';
const EVENT = 'inspection_log_users_change';

/**
 * How far the seed accounts below have been applied to this store.
 *
 * Bumped whenever a seed account is added, which happens when the system
 * gains a role. Without it a new role is invisible to every installation
 * already in use: the seeds are only ever written to an *empty* store, so an
 * operator would be told a Job Manager exists and find no account to sign in
 * as, no matter how many times they reloaded.
 *
 *   1  the original set: one admin, four branch managers, three inspectors
 *   2  adds the job manager over the maintenance board
 */
const SEED_VERSION = 2;
const SEED_VERSION_KEY = 'inspection_log_users_seed_version';

/**
 * The demo accounts.
 *
 * One admin, a manager for each seeded branch, one job manager over the
 * maintenance board, and three inspectors. The passwords are deliberately
 * memorable — this is a demo, and whoever is being shown the system has to
 * be able to sign in as each role in turn.
 *
 * Only ever written to a store that is empty, so an installation already in
 * use does not gain an account behind its operator's back. There, a new role
 * arrives the way any account does: the admin creates one.
 *
 * `admin@royalgujrat.com` is the account the shorthand `123` / `123` sign-in
 * resolves to, so the original demo credentials still work.
 */
export const SEED_USERS: User[] = [
  {
    id: 'usr-admin',
    name: 'Sami Ghani',
    email: 'admin@royalgujrat.com',
    password: 'admin123',
    role: 'admin',
    initials: 'SG',
    active: true,
    createdAt: '2026-01-05',
  },
  {
    id: 'usr-bm-zahras',
    name: 'Imran Yousaf',
    email: 'zahras@royalgujrat.com',
    password: 'branch123',
    role: 'branch-manager',
    branchName: BRANCHES[0].name,
    initials: 'IY',
    active: true,
    createdAt: '2026-01-05',
  },
  {
    id: 'usr-bm-gujrat',
    name: 'Bilal Tariq',
    email: 'gujrat@royalgujrat.com',
    password: 'branch123',
    role: 'branch-manager',
    branchName: BRANCHES[1].name,
    initials: 'BT',
    active: true,
    createdAt: '2026-01-05',
  },
  {
    id: 'usr-bm-mafraq',
    name: 'Adeel Nawaz',
    email: 'mafraq@royalgujrat.com',
    password: 'branch123',
    role: 'branch-manager',
    branchName: BRANCHES[2].name,
    initials: 'AN',
    active: true,
    createdAt: '2026-01-05',
  },
  {
    id: 'usr-bm-naan',
    name: 'Kashif Mehmood',
    email: 'naanhouse@royalgujrat.com',
    password: 'branch123',
    role: 'branch-manager',
    branchName: BRANCHES[3].name,
    initials: 'KM',
    active: true,
    createdAt: '2026-01-05',
  },
  {
    /*
     * One job manager, holding the maintenance board for all four branches.
     * Not one per branch: a repair is not a branch's private business, and
     * the same contractor covers the estate.
     */
    id: 'usr-jm-shahid',
    name: 'Shahid Anwar',
    email: 'jobs@royalgujrat.com',
    password: 'jobs123',
    role: 'job-manager',
    initials: 'SA',
    active: true,
    createdAt: '2026-01-05',
  },
  {
    id: 'usr-insp-rahman',
    name: 'A. Rahman',
    email: 'rahman@royalgujrat.com',
    password: 'visit123',
    role: 'inspector',
    initials: 'AR',
    active: true,
    createdAt: '2026-01-05',
  },
  {
    id: 'usr-insp-iqbal',
    name: 'S. Iqbal',
    email: 'iqbal@royalgujrat.com',
    password: 'visit123',
    role: 'inspector',
    initials: 'SI',
    active: true,
    createdAt: '2026-01-05',
  },
  {
    id: 'usr-insp-farooq',
    name: 'M. Farooq',
    email: 'farooq@royalgujrat.com',
    password: 'visit123',
    role: 'inspector',
    initials: 'MF',
    active: true,
    createdAt: '2026-01-05',
  },
];

/** The account `123` / `123` signs in as, while that shorthand exists. */
export const DEMO_SHORTHAND_USER_ID = 'usr-admin';

function notify(): void {
  window.dispatchEvent(new Event(EVENT));
}

function write(users: User[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(users));
    notify();
    return true;
  } catch (err) {
    console.error('Failed to save users:', err);
    return false;
  }
}

/** Which seed version this store has had applied. */
function storedSeedVersion(): number {
  try {
    const raw = localStorage.getItem(SEED_VERSION_KEY);
    // No marker means a store written before the marker existed, which is
    // version 1 by definition — not a fresh store, which is handled below.
    const version = raw === null ? 1 : Number(raw);
    return Number.isFinite(version) ? version : 1;
  } catch {
    // Storage unreadable: claim to be current, so nothing is written either
    return SEED_VERSION;
  }
}

function markSeeded(): void {
  try {
    localStorage.setItem(SEED_VERSION_KEY, String(SEED_VERSION));
  } catch {
    // Nothing to do — reconciliation is retried on the next read
  }
}

/**
 * Brings a store created under an earlier seed version up to date, once.
 *
 * Adds only what is genuinely absent, matched on id *and* on email: an
 * account the operator created themselves at the same address must not be
 * shadowed by a seed, because two accounts sharing an address would make
 * which one signs in a matter of list order.
 *
 * Runs at most once per version, so a seed account the operator later
 * withdraws stays withdrawn rather than reappearing on the next reload.
 * Writes without announcing itself: this is called from `getUsers`, which
 * screens call while rendering, and firing the change event there would set
 * state during a render. The reconciled list is returned instead, so the
 * caller sees the addition immediately and later reads find it in storage.
 */
function reconcileSeeds(stored: User[]): User[] {
  if (storedSeedVersion() >= SEED_VERSION) return stored;

  const ids = new Set(stored.map((u) => u.id));
  const emails = new Set(stored.map((u) => u.email.trim().toLowerCase()));
  const missing = SEED_USERS.filter(
    (seed) => !ids.has(seed.id) && !emails.has(seed.email.trim().toLowerCase())
  );

  if (missing.length === 0) {
    markSeeded();
    return stored;
  }

  const next = [...stored, ...missing];
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (err) {
    console.error('Failed to add new seed accounts:', err);
    // Marker deliberately left alone, so this is tried again next time
    return stored;
  }
  markSeeded();
  return next;
}

/** Every account, withdrawn ones included. */
export function getUsers(): User[] {
  if (typeof window === 'undefined') return SEED_USERS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      localStorage.setItem(KEY, JSON.stringify(SEED_USERS));
      // A store seeded from scratch is already current by construction
      markSeeded();
      return SEED_USERS;
    }
    const parsed = JSON.parse(raw) as User[];
    return Array.isArray(parsed) && parsed.length > 0 ? reconcileSeeds(parsed) : SEED_USERS;
  } catch (err) {
    console.error('Failed to read users:', err);
    return SEED_USERS;
  }
}

/** The accounts that can sign in today. */
export function activeUsers(users: User[] = getUsers()): User[] {
  return users.filter((u) => u.active);
}

export function getUserById(id: string | undefined | null): User | null {
  if (!id) return null;
  return getUsers().find((u) => u.id === id) ?? null;
}

/** The inspectors a surprise visit can be handed to. */
export function inspectors(users: User[] = getUsers()): User[] {
  return activeUsers(users).filter((u) => u.role === 'inspector');
}

/**
 * Checks a sign-in.
 *
 * Email is matched case-insensitively — people capitalise their own address
 * inconsistently, and it is a name here, not a secret. The password is not.
 * A withdrawn account is refused with the same wording as a wrong password:
 * whether an address exists is not something a sign-in form should confirm.
 */
export function authenticate(email: string, password: string): User | null {
  const wanted = email.trim().toLowerCase();
  const user = getUsers().find((u) => u.email.toLowerCase() === wanted);
  if (!user || !user.active) return null;
  return user.password === password ? user : null;
}

export interface SaveUserResult {
  ok: boolean;
  /** Why it was refused, ready to show. */
  error?: string;
  user?: User;
}

export interface UserDraft {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  branchName?: string;
}

/**
 * Validates a draft account against the rest of the list.
 *
 * `ignoreId` exempts the account being edited from the duplicate check, so
 * saving a user without touching their address is not refused as a clash
 * with themselves.
 */
function validate(draft: UserDraft, users: User[], ignoreId?: string): string | null {
  if (!draft.name.trim()) return 'Enter a name';

  const email = draft.email.trim().toLowerCase();
  if (!email) return 'Enter an email address';
  // Deliberately loose: enough to catch a typo, not a standards-compliant
  // parser. Addresses here are sign-in names on an internal system.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'That email address does not look right';
  if (users.some((u) => u.id !== ignoreId && u.email.toLowerCase() === email)) {
    return 'An account with that email already exists';
  }

  if (!draft.password.trim()) return 'Set a password';
  if (draft.password.trim().length < 3) return 'Use at least 3 characters for the password';

  // A branch manager's branch *is* their access, so the account cannot exist
  // without one. The other roles are not tied to a branch at all.
  if (draft.role === 'branch-manager' && !draft.branchName) {
    return 'Choose the branch this manager runs';
  }

  return null;
}

/**
 * The roles the admin creates accounts in.
 *
 * Every role except their own: a second main admin is not something this
 * screen mints, because an account that can then withdraw the account that
 * made it is not a thing to hand out from a form. The seeded admin account
 * can still be edited, which is how its own name and password are changed.
 */
export const MANAGED_ROLES: UserRole[] = ['branch-manager', 'job-manager', 'inspector'];

/** "a Branch Manager, a Job Manager or an Inspector" — for a refusal to name. */
function managedRoleList(): string {
  const labels = MANAGED_ROLES.map((role) => USER_ROLE_LABEL[role]);
  const last = labels[labels.length - 1];
  return `${labels.slice(0, -1).join(', ')} or ${last}`;
}

export function addUser(draft: UserDraft): SaveUserResult {
  const all = getUsers();

  if (!MANAGED_ROLES.includes(draft.role)) {
    // Named from the list itself, so adding a role cannot leave this lying
    return { ok: false, error: `New accounts can be a ${managedRoleList()}` };
  }

  const problem = validate(draft, all);
  if (problem) return { ok: false, error: problem };

  const name = draft.name.trim();
  const user: User = {
    id: `usr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    name,
    email: draft.email.trim(),
    password: draft.password.trim(),
    role: draft.role,
    branchName: draft.role === 'branch-manager' ? draft.branchName : undefined,
    initials: initialsOf(name),
    active: true,
    createdAt: new Date().toISOString().slice(0, 10),
  };

  if (!write([...all, user])) return { ok: false, error: 'Could not save the account' };
  return { ok: true, user };
}

export function updateUser(id: string, draft: UserDraft): SaveUserResult {
  const all = getUsers();
  const existing = all.find((u) => u.id === id);
  if (!existing) return { ok: false, error: 'That account no longer exists' };

  const problem = validate(draft, all, id);
  if (problem) return { ok: false, error: problem };

  const name = draft.name.trim();
  const updated: User = {
    ...existing,
    name,
    email: draft.email.trim(),
    password: draft.password.trim(),
    role: draft.role,
    branchName: draft.role === 'branch-manager' ? draft.branchName : undefined,
    initials: initialsOf(name),
  };

  if (!write(all.map((u) => (u.id === id ? updated : u)))) {
    return { ok: false, error: 'Could not save the account' };
  }
  return { ok: true, user: updated };
}

/** How much work is filed against an account, shown before withdrawing it. */
export function userUsage(user: User): { submitted: number; assigned: number } {
  const all = getInspections();
  return {
    submitted: all.filter((i) => i.submittedByUserId === user.id).length,
    assigned: all.filter((i) => i.assignedToUserId === user.id && i.status === 'assigned').length,
  };
}

export interface RemoveUserResult {
  ok: boolean;
  error?: string;
  /** True when history kept the row: deactivated rather than deleted. */
  deactivated?: boolean;
}

/**
 * Withdraws an account.
 *
 * Deleted outright when it has never touched an inspection; deactivated
 * otherwise, so the records it submitted still name a real person. Refuses
 * to remove the last admin — an operator with no admin cannot manage anything
 * ever again, including creating a replacement.
 */
export function removeUser(id: string): RemoveUserResult {
  const all = getUsers();
  const user = all.find((u) => u.id === id);
  if (!user) return { ok: false, error: 'That account no longer exists' };

  if (user.role === 'admin' && activeUsers(all).filter((u) => u.role === 'admin').length <= 1) {
    return { ok: false, error: 'Keep at least one Main Admin — nobody else can manage accounts' };
  }

  const usage = userUsage(user);
  const referenced = usage.submitted > 0 || usage.assigned > 0;

  const next = referenced
    ? all.map((u) => (u.id === id ? { ...u, active: false } : u))
    : all.filter((u) => u.id !== id);

  if (!write(next)) return { ok: false, error: 'Could not withdraw the account' };
  return { ok: true, deactivated: referenced };
}

/** Brings a withdrawn account back. */
export function restoreUser(id: string): RemoveUserResult {
  const all = getUsers();
  if (!all.some((u) => u.id === id)) return { ok: false, error: 'That account no longer exists' };
  if (!write(all.map((u) => (u.id === id ? { ...u, active: true } : u)))) {
    return { ok: false, error: 'Could not restore the account' };
  }
  return { ok: true };
}

export function subscribeToUsers(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
