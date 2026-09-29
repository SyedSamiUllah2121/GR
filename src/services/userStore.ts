import { BRANCHES, USER_ROLE_LABEL, User, UserRole, initialsOf } from '../types';
import { ensureEstate } from './estateReset';
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
 * operator would be told a Maintenance Manager exists and find no account to
 * sign in as, no matter how many times they reloaded.
 *
 *   1  one admin, a manager for each of the nine branches, the maintenance
 *      manager over the board, and three inspectors
 *   2  the estate's real branch managers in place of the invented ones —
 *      seven people across the nine branches, two of them running two each.
 *      The invented managers are retired by `RETIRED_SEEDS`.
 *   3  Mr. Altaf's sign-in keeps the title, as the others keep their whole
 *      name: `Mr.Altaf` / `Mr.Altaf123` rather than `Altaf` / `Altaf123`.
 *      Applied by `CORRECTED_SEEDS`.
 *
 * The count restarts with the estate. The accounts that came before managed
 * branches that do not exist, and `estateReset` clears them rather than
 * repointing them — a manager whose branch was invented has nothing to manage.
 */
const SEED_VERSION = 3;
const SEED_VERSION_KEY = 'inspection_log_users_seed_version';

/**
 * The demo accounts.
 *
 * One admin, the estate's seven branch managers, one maintenance manager over
 * the whole board, and three inspectors. Every branch has a manager by
 * construction, because a branch nobody manages cannot run its own Monday
 * round or report its own repairs. Parvezuddin runs both Shabiya 11 and 12,
 * and Musa Shafqat both Mussafah 26 branches, each from one account.
 *
 * A branch manager signs in with their name run together — `Parvezuddin`,
 * `AliBarakat` — and that name followed by `123` as the password. They are
 * starting credentials, not a security model, and the admin resets them from
 * /users. The other roles keep their demo addresses and passwords.
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
    id: 'usr-bm-parvezuddin',
    name: 'Parvezuddin',
    email: 'Parvezuddin',
    password: 'Parvezuddin123',
    role: 'branch-manager',
    branchNames: [BRANCHES[0].name, BRANCHES[3].name],
    initials: 'PA',
    active: true,
    createdAt: '2026-09-29',
  },
  {
    id: 'usr-bm-ali-barakat',
    name: 'Ali Barakat',
    email: 'AliBarakat',
    password: 'AliBarakat123',
    role: 'branch-manager',
    branchNames: [BRANCHES[4].name],
    initials: 'AB',
    active: true,
    createdAt: '2026-09-29',
  },
  {
    id: 'usr-bm-musa-shafqat',
    name: 'Musa Shafqat',
    email: 'MusaShafqat',
    password: 'MusaShafqat123',
    role: 'branch-manager',
    branchNames: [BRANCHES[7].name, BRANCHES[8].name],
    initials: 'MS',
    active: true,
    createdAt: '2026-09-29',
  },
  {
    id: 'usr-bm-mehran-shahabuddin',
    name: 'Mehran Shahabuddin',
    email: 'MehranShahabuddin',
    password: 'MehranShahabuddin123',
    role: 'branch-manager',
    branchNames: [BRANCHES[6].name],
    initials: 'MS',
    active: true,
    createdAt: '2026-09-29',
  },
  {
    id: 'usr-bm-altaf',
    name: 'Mr. Altaf',
    email: 'Mr.Altaf',
    password: 'Mr.Altaf123',
    role: 'branch-manager',
    branchNames: [BRANCHES[1].name],
    initials: 'MA',
    active: true,
    createdAt: '2026-09-29',
  },
  {
    id: 'usr-bm-muhammad-arshaan',
    name: 'Muhammad Arshaan',
    email: 'MuhammadArshaan',
    password: 'MuhammadArshaan123',
    role: 'branch-manager',
    branchNames: [BRANCHES[2].name],
    initials: 'MA',
    active: true,
    createdAt: '2026-09-29',
  },
  {
    id: 'usr-bm-farooq-khan',
    name: 'Farooq Khan',
    email: 'FarooqKhan',
    password: 'FarooqKhan123',
    role: 'branch-manager',
    branchNames: [BRANCHES[5].name],
    initials: 'FK',
    active: true,
    createdAt: '2026-09-29',
  },
  {
    /*
     * One maintenance manager, holding the maintenance board for every branch. Not
     * one per branch: a repair is not a branch's private business, and the
     * same contractor covers the estate.
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

/**
 * The invented branch managers the first seed shipped, by id and the address
 * they were created under.
 *
 * Retired when a store reaches seed version 2, because the estate's real
 * managers replace them. Matched on the address as well as the id so an
 * account the admin has since repointed at a real person — given their own
 * address — is left alone.
 */
const RETIRED_SEEDS: ReadonlyArray<{ id: string; email: string }> = [
  { id: 'usr-bm-nhb', email: 'shabiya11@royalgujrat.com' },
  { id: 'usr-bm-rg', email: 'royal@royalgujrat.com' },
  { id: 'usr-bm-dgr', email: 'mussafah17@royalgujrat.com' },
  { id: 'usr-bm-grsb', email: 'shabiya12@royalgujrat.com' },
  { id: 'usr-bm-nh', email: 'shabiya10@royalgujrat.com' },
  { id: 'usr-bm-mgr', email: 'mafraq@royalgujrat.com' },
  { id: 'usr-bm-mps', email: 'manpasand@royalgujrat.com' },
  { id: 'usr-bm-grs', email: 'hotel@royalgujrat.com' },
  { id: 'usr-bm-zg', email: 'zaharat@royalgujrat.com' },
];

/**
 * Seed sign-ins that shipped wrong and have since been corrected.
 *
 * Applied only while the account still holds exactly what it shipped with,
 * so a sign-in name or password the admin has since set is not overwritten.
 */
const CORRECTED_SEEDS: ReadonlyArray<{
  id: string;
  was: { email: string; password: string };
  now: { email: string; password: string };
}> = [
  {
    id: 'usr-bm-altaf',
    was: { email: 'Altaf', password: 'Altaf123' },
    now: { email: 'Mr.Altaf', password: 'Mr.Altaf123' },
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

  const retiring = (u: User) =>
    RETIRED_SEEDS.some(
      (r) => r.id === u.id && r.email === u.email.trim().toLowerCase()
    );
  // Deactivated rather than dropped once they have history, for the same
  // reason `removeUser` does: their name is on the records they touched.
  const kept = stored.flatMap((u) => {
    if (!retiring(u)) {
      const fix = CORRECTED_SEEDS.find(
        (c) => c.id === u.id && c.was.email === u.email && c.was.password === u.password
      );
      return [fix ? { ...u, ...fix.now } : u];
    }
    const usage = userUsage(u);
    return usage.submitted > 0 || usage.assigned > 0 ? [{ ...u, active: false }] : [];
  });
  const retired = kept.length !== stored.length || kept.some((u, i) => u !== stored[i]);

  const ids = new Set(kept.map((u) => u.id));
  const emails = new Set(kept.map((u) => u.email.trim().toLowerCase()));
  const missing = SEED_USERS.filter(
    (seed) => !ids.has(seed.id) && !emails.has(seed.email.trim().toLowerCase())
  );

  if (missing.length === 0 && !retired) {
    markSeeded();
    return stored;
  }

  const next = [...kept, ...missing];
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

/** An account as an earlier build may have saved it, with a single branch. */
type StoredUser = User & { branchName?: string };

/**
 * Reads an account saved before a manager could hold more than one branch.
 * Its one branch becomes a list of one; nothing else about it changes.
 */
function fromStored(stored: StoredUser): User {
  const { branchName, ...user } = stored;
  if (user.branchNames || !branchName) return user;
  return { ...user, branchNames: [branchName] };
}

/** Every account, withdrawn ones included. */
export function getUsers(): User[] {
  ensureEstate();
  if (typeof window === 'undefined') return SEED_USERS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      localStorage.setItem(KEY, JSON.stringify(SEED_USERS));
      // A store seeded from scratch is already current by construction
      markSeeded();
      return SEED_USERS;
    }
    const parsed = JSON.parse(raw) as StoredUser[];
    return Array.isArray(parsed) && parsed.length > 0
      ? reconcileSeeds(parsed.map(fromStored))
      : SEED_USERS;
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
 * The sign-in name — an email address or a username — is matched
 * case-insensitively and with any spaces ignored: people capitalise their own
 * name inconsistently, and type `Mehran Shahabuddin` for the username
 * `MehranShahabuddin`. It is a name here, not a secret, and no sign-in name
 * may hold a space, so ignoring them cannot make two accounts collide. The
 * password is matched exactly.
 * A withdrawn account is refused with the same wording as a wrong password:
 * whether an address exists is not something a sign-in form should confirm.
 */
export function authenticate(email: string, password: string): User | null {
  const signInName = (name: string) => name.replace(/\s+/g, '').toLowerCase();
  const wanted = signInName(email);
  const user = getUsers().find((u) => signInName(u.email) === wanted);
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
  branchNames?: string[];
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
  if (!email) return 'Enter an email address or username';
  // Deliberately loose: enough to catch a typo, not a standards-compliant
  // parser. Anything with an @ is taken as an address and checked as one;
  // anything without is a username, which is all a branch manager has.
  if (email.includes('@') && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return 'That email address does not look right';
  }
  if (users.some((u) => u.id !== ignoreId && u.email.toLowerCase() === email)) {
    return 'An account with that email or username already exists';
  }

  if (!draft.password.trim()) return 'Set a password';
  if (draft.password.trim().length < 3) return 'Use at least 3 characters for the password';

  // A branch manager's branch *is* their access, so the account cannot exist
  // without one. The other roles are not tied to a branch at all.
  if (draft.role === 'branch-manager' && !draft.branchNames?.length) {
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

/** "a Branch Manager, a Maintenance Manager or an Inspector" — for a refusal
 *  to name. Built from USER_ROLE_LABEL, so renaming a role renames it here. */
function managedRoleList(): string {
  const labels = MANAGED_ROLES.map((role) => USER_ROLE_LABEL[role]);
  const last = labels[labels.length - 1];
  return `${labels.slice(0, -1).join(', ')} or ${last}`;
}

/**
 * The draft as it will be saved: the sign-in name with any spaces taken out.
 *
 * Taken out rather than refused. Sign-in ignores spaces already, so an admin
 * who types `Sami Test` means the username `SamiTest`, and turning that away
 * was a refusal over a difference the sign-in form would never notice.
 */
function tidied(draft: UserDraft): UserDraft {
  return { ...draft, email: draft.email.replace(/\s+/g, '') };
}

export function addUser(input: UserDraft): SaveUserResult {
  const all = getUsers();
  const draft = tidied(input);

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
    branchNames: draft.role === 'branch-manager' ? draft.branchNames : undefined,
    initials: initialsOf(name),
    active: true,
    createdAt: new Date().toISOString().slice(0, 10),
  };

  if (!write([...all, user])) return { ok: false, error: 'Could not save the account' };
  return { ok: true, user };
}

export function updateUser(id: string, input: UserDraft): SaveUserResult {
  const all = getUsers();
  const draft = tidied(input);
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
    branchNames: draft.role === 'branch-manager' ? draft.branchNames : undefined,
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
