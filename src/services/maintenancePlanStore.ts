import {
  EquipmentCategory,
  Interval,
  IntervalUnit,
  MaintenanceCategory,
  MaintenancePlan,
  Severity,
} from '../types';
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
 *   2  a general-maintenance plan for every category, and cadences that can be
 *      counted in days as well as months
 */
const SEED_VERSION = 2;
const SEED_VERSION_KEY = 'inspection_log_maintenance_plans_seed_version';

/** Intervals the editor offers. Longer than two years stops being a plan. */
export const INTERVAL_CHOICES = [1, 2, 3, 4, 6, 12, 18, 24];

/** And in days, for the cadences nobody would express in months. */
export const DAY_INTERVAL_CHOICES = [1, 3, 7, 10, 14, 21, 30, 45, 60, 90, 180];

/**
 * The task every category's general maintenance is written under.
 *
 * A fixed string rather than something the operator types, because the general
 * maintenance of a category is one thing and has to be findable as that thing
 * — the row on the register, the cadence in the category editor and the job on
 * the board all have to agree about which plan they mean.
 */
export const GENERAL_TASK = 'General maintenance';

/**
 * The id of a category's general-maintenance plan.
 *
 * Derived through `planIdFor` like any other, so general maintenance is a plan
 * in every respect that matters: the scheduler raises it, an asset overrides
 * it, completing it resets it, and the month-end report counts it. There is no
 * second code path for it, and that is the design — an operator who asks "when
 * is this fridge next due" must not be able to get two answers.
 */
export function generalPlanIdFor(category: MaintenanceCategory): string {
  return planIdFor(category, GENERAL_TASK);
}

/** Whether a plan is a category's general maintenance rather than a named task. */
export function isGeneralPlan(plan: { id: string; category: MaintenanceCategory }): boolean {
  return plan.id === generalPlanIdFor(plan.category);
}

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
    if (missing.length === 0) {
      markSeeded();
      return current;
    }

    // Written before the marker, so a full browser retries rather than
    // recording a seed it never actually applied
    const merged = [...current, ...missing];
    if (!write(merged)) return current;
    markSeeded();
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
 *
 * DO NOT CHANGE HOW THIS SLUGS. It has callers now that cannot tolerate it
 * moving: `generalPlanIdFor` builds a category's general-maintenance id from
 * it, `isGeneralPlan` recognises one by rebuilding it, and the three seed files
 * spell the same shape out by hand because importing this module would close a
 * cycle. Change the rule and every stored general plan silently stops being
 * general — the cadence field in the category editor writes nowhere,
 * `ensureGeneralPlans` creates a duplicate at the new id, and nothing errors.
 */
export function planIdFor(category: MaintenanceCategory, task: string): string {
  const slug = task.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `plan-${category.toLowerCase()}-${slug || 'service'}`;
}

export interface PlanDraft {
  category: MaintenanceCategory;
  task: string;
  /** How often, in whichever unit the operator thinks about it in. */
  interval: Interval;
  priority: Severity;
  instructions?: string | null;
}

export interface SavePlanResult {
  ok: boolean;
  plan?: MaintenancePlan;
  error?: string;
}

/**
 * Why a cadence cannot be used, or null when it is fine.
 *
 * A whole number is not fussiness: the schedule counts occurrences from the
 * anchor, and half a month is a step that never advances — the arithmetic
 * settles on the anchor itself and reports the asset overdue for ever.
 */
export function intervalProblem(interval: Interval): string | null {
  if (!Number.isInteger(interval.every) || interval.every < 1) {
    return 'Choose how often it falls due, as a whole number';
  }
  if (interval.unit === 'months' && interval.every > 60) {
    return 'An interval longer than five years is not a plan';
  }
  if (interval.unit === 'days' && interval.every > 730) {
    return 'Past two years, say it in months';
  }
  return null;
}

function validate(draft: PlanDraft): string | null {
  if (!draft.task.trim()) return 'Say what recurs, e.g. “Service” or “Toner refill”';
  return intervalProblem(draft.interval);
}

/**
 * The two ways a cadence is stored: the new pair, and the months field every
 * plan already in a browser is read through.
 *
 * `everyMonths` is kept truthful rather than zeroed, so a plan written today
 * and read by code that has not been updated still gets a sane answer. A
 * cadence in days rounds to the nearest whole month, at least one.
 */
function intervalFields(interval: Interval): {
  every: number;
  unit: IntervalUnit;
  everyMonths: number;
} {
  const everyMonths =
    interval.unit === 'months'
      ? interval.every
      : Math.max(1, Math.round(interval.every / 30));
  return { every: interval.every, unit: interval.unit, everyMonths };
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
    ...intervalFields(draft.interval),
    priority: draft.priority,
    instructions: (draft.instructions ?? '').trim() || null,
    active: true,
    createdAt: now,
  };

  if (!write([...all, plan])) return { ok: false, error: 'Could not save that plan' };
  return { ok: true, plan };
}

/**
 * Gives every category a general-maintenance plan, and leaves alone any that
 * already has one.
 *
 * Run when the app mounts, beside the sweep, because a category the operator
 * added yesterday has to start raising work today without anybody being made
 * to go and write its plan by hand. Matched on the derived id, so this is
 * idempotent — and so a general plan somebody has deliberately turned OFF
 * stays off rather than springing back on the next load.
 *
 * Returns how many it wrote, which is nothing anybody sees; it is here so the
 * caller can tell "there was nothing to do" from "storage is full".
 */
export function ensureGeneralPlans(
  categories: EquipmentCategory[],
  now: string,
  fallback: Interval = { every: 6, unit: 'months' }
): { created: number; failed: boolean } {
  const all = getPlans();
  const known = new Set(all.map((p) => p.id));

  const missing = categories
    .filter((c) => c.active && !known.has(generalPlanIdFor(c.id)))
    .map<MaintenancePlan>((c) => ({
      id: generalPlanIdFor(c.id),
      category: c.id,
      task: GENERAL_TASK,
      ...intervalFields(fallback),
      priority: 'medium',
      instructions: 'General maintenance: clean, check, test, and note anything wearing.',
      active: true,
      createdAt: now,
    }));

  if (missing.length === 0) return { created: 0, failed: false };
  if (!write([...all, ...missing])) return { created: 0, failed: true };
  return { created: missing.length, failed: false };
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
    /*
     * A general plan keeps its category and its name whatever the draft says.
     * Both are derived into its id, which scheduled jobs already carry, so
     * editing either would leave the category without a general plan and the
     * jobs pointing at one that no longer describes them. The cadence is the
     * part of it anybody means to change.
     */
    category: isGeneralPlan(existing) ? existing.category : draft.category,
    task: isGeneralPlan(existing) ? existing.task : draft.task.trim(),
    ...intervalFields(draft.interval),
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
  const existing = all.find((p) => p.id === id);
  if (!existing) return { ok: false, error: 'That plan is no longer on record' };
  /*
   * Never a general plan. `ensureGeneralPlans` would write it straight back on
   * the next load, so deleting one is not a thing that can be made to happen —
   * and the thing the operator actually wants, a category that raises nothing,
   * is what turning it off does.
   */
  if (isGeneralPlan(existing)) {
    return {
      ok: false,
      error: 'General maintenance belongs to the category — turn it off instead',
    };
  }
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
