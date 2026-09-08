import { BRANCHES, Branch } from '../types';
import { getInspections } from './storage';
import { getJobs } from './maintenanceStore';

/**
 * The branches this operator runs.
 *
 * Held in storage rather than as a constant, because a company opens a shop.
 * `BRANCHES` in types.ts is the seed the store starts from, not the list
 * itself — read this instead of importing that constant.
 *
 * Removing follows the same rule the checklist uses for questions: a branch
 * nothing refers to is deleted outright, and one with history is archived.
 * Inspections and jobs record their branch as *text*, so deleting a branch
 * that has been inspected would leave records pointing at nothing.
 */

const KEY = 'inspection_log_branches_v1';
const EVENT = 'inspection_log_branches_change';

/** Same shape as an id in the seed: lowercase, dashes, no punctuation. */
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'branch'
  );
}

function notify(): void {
  window.dispatchEvent(new Event(EVENT));
}

function write(branches: Branch[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(branches));
    notify();
    return true;
  } catch (err) {
    console.error('Failed to save branches:', err);
    return false;
  }
}

/** Every branch, closed ones included. Filter on `archived` to offer choices. */
export function getBranches(): Branch[] {
  if (typeof window === 'undefined') return BRANCHES;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      localStorage.setItem(KEY, JSON.stringify(BRANCHES));
      return BRANCHES;
    }
    const parsed = JSON.parse(raw) as Branch[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : BRANCHES;
  } catch (err) {
    console.error('Failed to read branches:', err);
    return BRANCHES;
  }
}

/** The branches open for new work. */
export function activeBranches(branches: Branch[] = getBranches()): Branch[] {
  return branches.filter((b) => !b.archived);
}

/** How much history is filed against a branch name. */
export function branchUsage(name: string): { inspections: number; jobs: number } {
  return {
    inspections: getInspections().filter((i) => i.branchName === name).length,
    jobs: getJobs().filter((j) => j.branchName === name).length,
  };
}

export interface AddBranchResult {
  ok: boolean;
  /** Why it was refused, ready to show. */
  error?: string;
  branch?: Branch;
  /** True when this reopened a branch that had been closed. */
  reopened?: boolean;
}

/**
 * Adds a branch, or reopens a closed one of the same name — which is how a
 * branch archived by mistake comes back, history and all.
 *
 * Refuses a duplicate of an open branch rather than creating a second one:
 * inspections are filed against the branch *name*, so two branches sharing
 * one would silently merge their history.
 */
export function addBranch(name: string, location: string): AddBranchResult {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: 'Give the branch a name' };

  const all = getBranches();
  const match = all.find((b) => b.name.toLowerCase() === trimmed.toLowerCase());

  if (match && !match.archived) {
    return { ok: false, error: 'A branch with that name already exists' };
  }

  if (match?.archived) {
    const reopened: Branch = {
      ...match,
      archived: false,
      location: location.trim() || match.location,
    };
    if (!write(all.map((b) => (b.id === match.id ? reopened : b)))) {
      return { ok: false, error: 'Could not save the branch' };
    }
    return { ok: true, branch: reopened, reopened: true };
  }

  // Ids only have to be unique; the name is what records are filed against
  let id = slugify(trimmed);
  if (all.some((b) => b.id === id)) id = `${id}-${all.length + 1}`;

  const branch: Branch = { id, name: trimmed, location: location.trim() };
  if (!write([...all, branch])) return { ok: false, error: 'Could not save the branch' };
  return { ok: true, branch };
}

export interface RemoveBranchResult {
  ok: boolean;
  error?: string;
  /** True when history kept it: closed rather than deleted. */
  archived?: boolean;
  usage?: { inspections: number; jobs: number };
}

/**
 * Removes a branch.
 *
 * Deleted outright when no inspection or maintenance job names it; archived
 * otherwise, so those records still read correctly. Refuses to remove the
 * last open branch, since an inspection has to be filed against something.
 */
export function removeBranch(id: string): RemoveBranchResult {
  const all = getBranches();
  const branch = all.find((b) => b.id === id);
  if (!branch) return { ok: false, error: 'That branch no longer exists' };

  if (activeBranches(all).length <= 1) {
    return { ok: false, error: 'Keep at least one branch — inspections are filed against one' };
  }

  const usage = branchUsage(branch.name);
  const referenced = usage.inspections > 0 || usage.jobs > 0;

  const next = referenced
    ? all.map((b) => (b.id === id ? { ...b, archived: true } : b))
    : all.filter((b) => b.id !== id);

  if (!write(next)) return { ok: false, error: 'Could not remove the branch' };
  return { ok: true, archived: referenced, usage };
}

export function subscribeToBranches(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
