import { MaintenanceCategory, MaintenancePlan, Severity } from '../types';
import { SEED_PLANS } from '../data/seedPlans';

/**
 * The recurring services, one rule per task per category.
 *
 * "Printers: service every 3 months, toner every 6" is two plans against
 * COOKING_EQUIPMENT's sibling category, and it applies to every printer on
 * the register at every branch. That is the whole point of writing them per
 * category: nobody is going to set an interval on each of forty air
 * conditioners, and a register that demanded it would simply go unmaintained.
 *
 * Only the admin and the Maintenance Manager may edit these — they decide
 * what the estate does, not one branch — but reading is not gated, because
 * the scheduler runs for everybody and a branch is shown what is due at it.
 */

const KEY = 'inspection_log_maintenance_plans_v1';
const EVENT = 'inspection_log_maintenance_plans_change';

/**
 * How far the seed list has been applied. Same device as the branches and the
 * equipment use: the seed is only written to an *empty* store, so without a
 * marker a plan added later would never reach an installation in use.
 *
 *   1  the first set — the intervals discussed when the feature was specified
 */
const SEED_VERSION = 1;
const SEED_VERSION_KEY = 'inspection_log_maintenance_plans_seed_version';

/** Intervals the editor offers. Longer than two years stops being a plan. */
export const INTERVAL_CHOICES = [1, 2, 3, 4, 6, 12, 18, 24];

function notify(): void {
  window.dispatchEvent(new Event(EVENT));
}

function write(all: MaintenancePlan[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
    notify();
    return true;
  } catch (err) {
    console.error('Failed to save maintenance plans:', err);
    return false;
  }
}

function storedSeedVersion(): number {
  try {
    const raw = localStorage.getItem(SEED_VERSION_KEY);
    return raw === null ? 0 : Number(raw) || 0;
  } catch {
    return SEED_VERSION;
  }
}

function markSeeded(): void {
  try {
    localStorage.setItem(SEED_VERSION_KEY, String(SEED_VERSION));
  } catch {
    // Only re-runs a no-op merge if lost
  }
}

export function getPlans(): MaintenancePlan[] {
  if (typeof window === 'undefined') return SEED_PLANS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      write(SEED_PLANS);
      markSeeded();
      return SEED_PLANS;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      write(SEED_PLANS);
      markSeeded();
      return SEED_PLANS;
    }

    const current = parsed as MaintenancePlan[];
    if (storedSeedVersion() >= SEED_VERSION) return current;

    const known = new Set(current.map((p) => p.id));
    const missing = SEED_PLANS.filter((p) => !known.has(p.id));
    markSeeded();
    if (missing.length === 0) return current;

    const merged = [...current, ...missing];
    write(merged);
    return merged;
  } catch (err) {
    console.error('Failed to read maintenance plans:', err);
    return SEED_PLANS;
  }
}

/** The plans currently in force. */
export function activePlans(all: MaintenancePlan[] = getPlans()): MaintenancePlan[] {
  return all.filter((p) => p.active);
}

/** The plans in force for one trade. */
export function plansForCategory(
  category: MaintenanceCategory,
  all: MaintenancePlan[] = getPlans()
): MaintenancePlan[] {
  return activePlans(all).filter((p) => p.category === category);
}

export function getPlanById(id: string): MaintenancePlan | null {
  return getPlans().find((p) => p.id === id) ?? null;
}

/**
 * A plan's id is derived from its category and task, so the same rule written
 * twice lands on one record — and so the id a scheduled job carries stays
 * readable rather than being a counter nobody can trace.
 */
export function planIdFor(category: MaintenanceCategory, task: string): string {
  const slug = task.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `plan-${category.toLowerCase()}-${slug || 'service'}`;
}

export interface PlanDraft {
  category: MaintenanceCategory;
  task: string;
  everyMonths: number;
  priority: Severity;
  instructions?: string | null;
}

export interface SavePlanResult {
  ok: boolean;
  plan?: MaintenancePlan;
  error?: string;
}

function validate(draft: PlanDraft): string | null {
  if (!draft.task.trim()) return 'Say what recurs, e.g. “Service” or “Toner refill”';
  if (!Number.isInteger(draft.everyMonths) || draft.everyMonths < 1) {
    return 'Choose how often it falls due';
  }
  if (draft.everyMonths > 60) return 'An interval longer than five years is not a plan';
  return null;
}

export function addPlan(draft: PlanDraft, now: string): SavePlanResult {
  const problem = validate(draft);
  if (problem) return { ok: false, error: problem };

  const id = planIdFor(draft.category, draft.task);
  const all = getPlans();
  if (all.some((p) => p.id === id)) {
    return { ok: false, error: 'That category already has a plan for that task' };
  }

  const plan: MaintenancePlan = {
    id,
    category: draft.category,
    task: draft.task.trim(),
    everyMonths: draft.everyMonths,
    priority: draft.priority,
    instructions: (draft.instructions ?? '').trim() || null,
    active: true,
    createdAt: now,
  };

  if (!write([...all, plan])) return { ok: false, error: 'Could not save that plan' };
  return { ok: true, plan };
}

/**
 * Edits a plan in place, id and all.
 *
 * The id is deliberately not re-derived when the task is renamed: scheduled
 * jobs already carry it, and changing it would both orphan those jobs and let
 * the scheduler raise the whole series again under the new name.
 */
export function updatePlan(id: string, draft: PlanDraft): SavePlanResult {
  const problem = validate(draft);
  if (problem) return { ok: false, error: problem };

  const all = getPlans();
  const existing = all.find((p) => p.id === id);
  if (!existing) return { ok: false, error: 'That plan is no longer on record' };

  const plan: MaintenancePlan = {
    ...existing,
    category: draft.category,
    task: draft.task.trim(),
    everyMonths: draft.everyMonths,
    priority: draft.priority,
    instructions: (draft.instructions ?? '').trim() || null,
  };

  if (!write(all.map((p) => (p.id === id ? plan : p)))) {
    return { ok: false, error: 'Could not save that plan' };
  }
  return { ok: true, plan };
}

/**
 * Turns a plan off or on.
 *
 * Off rather than deleted, so the scheduled jobs it has already raised still
 * name a plan that can be looked up — and so turning it back on resumes the
 * series instead of starting a fresh one.
 */
export function setPlanActive(id: string, active: boolean): SavePlanResult {
  const all = getPlans();
  const existing = all.find((p) => p.id === id);
  if (!existing) return { ok: false, error: 'That plan is no longer on record' };
  const plan = { ...existing, active };
  return write(all.map((p) => (p.id === id ? plan : p)))
    ? { ok: true, plan }
    : { ok: false, error: 'Could not save that plan' };
}

/** Removes a plan outright. Only offered for one that has raised nothing. */
export function deletePlan(id: string): SavePlanResult {
  const all = getPlans();
  if (!all.some((p) => p.id === id)) return { ok: false, error: 'That plan is no longer on record' };
  return write(all.filter((p) => p.id !== id))
    ? { ok: true }
    : { ok: false, error: 'Could not delete that plan' };
}

export function subscribeToPlans(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
