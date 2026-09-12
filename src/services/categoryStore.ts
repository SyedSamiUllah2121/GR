import { EquipmentCategory, FALLBACK_CATEGORY, MaintenanceCategory } from '../types';
import { SEED_CATEGORIES } from '../data/seedCategories';

/**
 * The trades the operator services things under.
 *
 * A list rather than a hardcoded enum because it is the operator's list: one
 * chain thinks in "Fridges, ACs, fire extinguishers", another in
 * "Refrigeration, HVAC, Fire safety", and the app has no business having an
 * opinion about which. Adding a category is how a new kind of kit gets a
 * servicing cadence, so this store is the front door to the whole schedule.
 *
 * Modelled on `branchStore`, down to the bare `localStorage.setItem` inside
 * the seed reconciliation: `getCategories` is called from `useState`
 * initialisers, and dispatching the change event from inside a read would set
 * state during a render.
 *
 * Withdrawing follows the rule the branches, the checklist and the equipment
 * register already follow: a category nothing names is deleted outright, one
 * that jobs, assets or plans name is archived. A job records its category as
 * text that has to outlive the list it came from, so a deleted id would leave
 * the month-end report filing work under nothing.
 */

const KEY = 'inspection_log_equipment_categories_v1';
const EVENT = 'inspection_log_equipment_categories_change';

/**
 * How far the seed list has been applied.
 *
 * Starts at 1 with a missing marker reading as 0 — unlike the branches, which
 * read a missing marker as 1 because branches predate the marker existing.
 * Nothing predates this store, so an installation with no marker has genuinely
 * had nothing applied and must reconcile.
 *
 *   1  the original eleven trades, plus water heating and security
 */
const SEED_VERSION = 1;
const SEED_VERSION_KEY = 'inspection_log_equipment_categories_seed_version';

function notify(): void {
  window.dispatchEvent(new Event(EVENT));
}

function write(all: EquipmentCategory[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
    notify();
    return true;
  } catch (err) {
    console.error('Failed to save equipment categories:', err);
    return false;
  }
}

function storedSeedVersion(): number {
  try {
    const raw = localStorage.getItem(SEED_VERSION_KEY);
    return raw === null ? 0 : Number(raw) || 0;
  } catch {
    // Storage unreadable: claim to be current, so nothing is written either
    return SEED_VERSION;
  }
}

function markSeeded(): void {
  try {
    localStorage.setItem(SEED_VERSION_KEY, String(SEED_VERSION));
  } catch {
    // The marker is an optimisation; losing it only re-runs a no-op merge
  }
}

/**
 * Adds seed categories this installation has not seen, matched by id.
 *
 * Writes with a bare `setItem` rather than through `write`, because this runs
 * inside `getCategories`, which screens call while rendering — firing the
 * change event here would set state during a render. The marker is left alone
 * when the write fails, so a full browser retries rather than losing the
 * addition silently.
 */
function reconcileSeeds(stored: EquipmentCategory[]): EquipmentCategory[] {
  if (storedSeedVersion() >= SEED_VERSION) return stored;

  const ids = new Set(stored.map((c) => c.id));
  const labels = new Set(stored.map((c) => c.label.trim().toLowerCase()));
  const missing = SEED_CATEGORIES.filter(
    (seed) => !ids.has(seed.id) && !labels.has(seed.label.trim().toLowerCase())
  );

  if (missing.length === 0) {
    markSeeded();
    return stored;
  }

  const next = [...stored, ...missing];
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch (err) {
    console.error('Failed to add new seed categories:', err);
    return stored;
  }
  markSeeded();
  return next;
}

/** Every category, archived ones included. */
export function getCategories(): EquipmentCategory[] {
  if (typeof window === 'undefined') return SEED_CATEGORIES;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      localStorage.setItem(KEY, JSON.stringify(SEED_CATEGORIES));
      markSeeded();
      return SEED_CATEGORIES;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.setItem(KEY, JSON.stringify(SEED_CATEGORIES));
      markSeeded();
      return SEED_CATEGORIES;
    }

    return reconcileSeeds(parsed as EquipmentCategory[]);
  } catch (err) {
    console.error('Failed to read equipment categories:', err);
    return SEED_CATEGORIES;
  }
}

/** The categories still on offer. */
export function activeCategories(
  all: EquipmentCategory[] = getCategories()
): EquipmentCategory[] {
  return all.filter((c) => c.active);
}

export function getCategoryById(
  id: string,
  all: EquipmentCategory[] = getCategories()
): EquipmentCategory | null {
  return all.find((c) => c.id === id) ?? null;
}

/**
 * A category's words, from its id.
 *
 * Falls back to the id rather than to an empty string, and that is the whole
 * point of it: a job filed two years ago under a trade somebody has since
 * withdrawn still has to print something on the month-end report. A blank
 * there reads as a bug in the report; "REFRIGERATION" reads as a category
 * nobody uses any more, which is the truth.
 */
export function categoryLabel(
  id: MaintenanceCategory,
  all: EquipmentCategory[] = getCategories()
): string {
  return all.find((c) => c.id === id)?.label ?? id;
}

/**
 * Which category a new record should default to.
 *
 * The fallback when it is still on the list, and the first category on offer
 * when it is not — never a hardcoded trade. A chain with no printers will
 * withdraw "IT & printers", and a form that defaults to it would file a
 * broken oven under printers.
 */
export function defaultCategory(all: EquipmentCategory[] = getCategories()): string {
  const active = activeCategories(all);
  if (active.some((c) => c.id === FALLBACK_CATEGORY)) return FALLBACK_CATEGORY;
  return active[0]?.id ?? FALLBACK_CATEGORY;
}

/** Whether this is the system category, which may not be renamed or removed. */
export function isSystemCategory(id: string): boolean {
  return id === FALLBACK_CATEGORY;
}

/**
 * An id derived from the words, so the same category written twice lands on
 * one record — the device `equipmentIdFor` and `planIdFor` already use.
 */
export function categoryIdFor(label: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'category';
}

export interface SaveCategoryResult {
  ok: boolean;
  category?: EquipmentCategory;
  error?: string;
}

export function addCategory(label: string, now: string): SaveCategoryResult {
  const name = label.trim();
  if (!name) return { ok: false, error: 'Give the category a name' };
  if (name.length > 40) return { ok: false, error: 'That name is too long to read on a row' };

  const all = getCategories();
  const id = categoryIdFor(name);
  if (all.some((c) => c.id === id || c.label.trim().toLowerCase() === name.toLowerCase())) {
    return { ok: false, error: `There is already a category called “${name}”` };
  }

  const category: EquipmentCategory = { id, label: name, active: true, createdAt: now };
  if (!write([...all, category])) {
    return { ok: false, error: 'There is no room left in this browser to store that' };
  }
  return { ok: true, category };
}

/**
 * Changes what a category is called, and nothing else.
 *
 * The id is deliberately untouched. Plan ids are built from it and scheduled
 * job ids are built from those, so re-deriving it on a rename would orphan
 * every job the category has ever raised and let the sweep raise the whole
 * series again under the new name.
 */
export function renameCategory(id: string, label: string): SaveCategoryResult {
  const name = label.trim();
  if (!name) return { ok: false, error: 'Give the category a name' };

  const all = getCategories();
  const existing = all.find((c) => c.id === id);
  if (!existing) return { ok: false, error: 'That category is no longer on record' };
  if (isSystemCategory(id)) {
    return { ok: false, error: '“Other” is where unrecognised work is filed, so it keeps its name' };
  }
  if (
    all.some((c) => c.id !== id && c.label.trim().toLowerCase() === name.toLowerCase())
  ) {
    return { ok: false, error: `There is already a category called “${name}”` };
  }

  const next = { ...existing, label: name };
  return write(all.map((c) => (c.id === id ? next : c)))
    ? { ok: true, category: next }
    : { ok: false, error: 'Could not save that' };
}

export function setCategoryActive(id: string, active: boolean): SaveCategoryResult {
  const all = getCategories();
  const existing = all.find((c) => c.id === id);
  if (!existing) return { ok: false, error: 'That category is no longer on record' };
  if (isSystemCategory(id) && !active) {
    return { ok: false, error: '“Other” is where unrecognised work is filed, so it stays on offer' };
  }
  const next = { ...existing, active };
  return write(all.map((c) => (c.id === id ? next : c)))
    ? { ok: true, category: next }
    : { ok: false, error: 'Could not save that' };
}

export interface RemoveCategoryResult {
  ok: boolean;
  /** True when it was archived rather than deleted, because records name it. */
  archived?: boolean;
  error?: string;
}

/**
 * Withdraws a category.
 *
 * Deleted outright when nothing names it, archived when anything does — the
 * rule the branches and the register already follow. `referenced` is passed in
 * rather than counted here so this module does not have to know about jobs,
 * assets or plans.
 */
export function removeCategory(id: string, referenced: boolean): RemoveCategoryResult {
  const all = getCategories();
  if (!all.some((c) => c.id === id)) {
    return { ok: false, error: 'That category is no longer on record' };
  }
  if (isSystemCategory(id)) {
    return { ok: false, error: '“Other” is where unrecognised work is filed, so it cannot be removed' };
  }
  if (activeCategories(all).length <= 1) {
    return { ok: false, error: 'Something has to be serviced under something' };
  }

  if (referenced) {
    const next = all.map((c) => (c.id === id ? { ...c, active: false } : c));
    return write(next) ? { ok: true, archived: true } : { ok: false, error: 'Could not save that' };
  }
  return write(all.filter((c) => c.id !== id))
    ? { ok: true, archived: false }
    : { ok: false, error: 'Could not save that' };
}

export function subscribeToCategories(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
