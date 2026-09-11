import { Equipment, MaintenanceCategory } from '../types';
import { SEED_EQUIPMENT } from '../data/seedEquipment';
import { isRealIsoDay } from './maintenanceSchedule';

/**
 * The assets each branch runs.
 *
 * Held in storage like the branches and the checklist, and seeded from
 * `data/seedEquipment.ts` so a fresh installation has something to look at.
 * The operator's real appliance list replaces it: `importEquipment` takes a
 * whole list at once, because typing forty air conditioners into a form one
 * at a time is not a thing anybody will do.
 *
 * Withdrawing follows the rule the branches and the checklist already use: an
 * asset nothing refers to is deleted outright, and one that jobs point at is
 * archived. Jobs record `equipmentId`, so deleting a serviced asset would
 * leave that history pointing at nothing.
 */

const KEY = 'inspection_log_equipment_v1';
const EVENT = 'inspection_log_equipment_change';

/**
 * How far the seed list has been applied to this store.
 *
 * Same device as the branches use, and for the same reason: the seed is only
 * ever written to an *empty* store, so without a marker a later addition
 * would be invisible to every installation already in use.
 *
 *   1  the first set — one printer, one chiller and one AC per branch
 */
const SEED_VERSION = 1;
const SEED_VERSION_KEY = 'inspection_log_equipment_seed_version';

function notify(): void {
  window.dispatchEvent(new Event(EVENT));
}

function write(all: Equipment[]): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
    notify();
    return true;
  } catch (err) {
    console.error('Failed to save equipment:', err);
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
 * Every asset on record, archived ones included.
 *
 * Merges in any seed items this store has not seen, matched by id, so an
 * installation already in use gains later additions without losing the
 * operator's own entries or their edits to the seeded ones.
 */
export function getEquipment(): Equipment[] {
  if (typeof window === 'undefined') return SEED_EQUIPMENT;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      write(SEED_EQUIPMENT);
      markSeeded();
      return SEED_EQUIPMENT;
    }

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      write(SEED_EQUIPMENT);
      markSeeded();
      return SEED_EQUIPMENT;
    }

    const current = parsed as Equipment[];
    if (storedSeedVersion() >= SEED_VERSION) return current;

    const known = new Set(current.map((e) => e.id));
    const missing = SEED_EQUIPMENT.filter((e) => !known.has(e.id));
    markSeeded();
    if (missing.length === 0) return current;

    const merged = [...current, ...missing];
    write(merged);
    return merged;
  } catch (err) {
    console.error('Failed to read equipment:', err);
    return SEED_EQUIPMENT;
  }
}

/** The assets still in service. */
export function activeEquipment(all: Equipment[] = getEquipment()): Equipment[] {
  return all.filter((e) => e.active);
}

/** The assets in service at one branch, in the order they read best. */
export function equipmentAt(branchName: string, all: Equipment[] = getEquipment()): Equipment[] {
  return activeEquipment(all)
    .filter((e) => e.branchName === branchName)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function getEquipmentById(id: string): Equipment | null {
  return getEquipment().find((e) => e.id === id) ?? null;
}

/**
 * An id derived from the branch and the name, so importing the same list
 * twice lands on the same records rather than doubling the register — the
 * device `jobIdFor` already uses for inspection findings.
 */
export function equipmentIdFor(branchName: string, name: string): string {
  const slug = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `eq-${slug(branchName)}-${slug(name) || 'item'}`;
}

export interface EquipmentDraft {
  branchName: string;
  name: string;
  category: MaintenanceCategory;
  serialNumber?: string | null;
  make?: string | null;
  model?: string | null;
  location?: string | null;
  installedOn?: string | null;
  notes?: string | null;
}

export interface SaveEquipmentResult {
  ok: boolean;
  equipment?: Equipment;
  error?: string;
}

const trimmed = (v: string | null | undefined): string | null => {
  const s = (v ?? '').trim();
  return s === '' ? null : s;
};

/**
 * Why an install date cannot be used, or null when it is fine.
 *
 * Blank is fine — plenty of assets pre-date anybody writing them down, and
 * the schedule falls back to the day the record was made. What is not fine is
 * a date that does not exist: the schedule counts from this, so "2026-02-30"
 * would anchor a plan to a day nobody meant.
 */
function installDateProblem(value: string | null): string | null {
  if (value === null) return null;
  if (!isRealIsoDay(value)) return `“${value}” is not a real date — use YYYY-MM-DD`;
  return null;
}

/** Adds an asset, refusing a nameless one and a duplicate of one on record. */
export function addEquipment(draft: EquipmentDraft, now: string): SaveEquipmentResult {
  const name = draft.name.trim();
  if (!name) return { ok: false, error: 'Give the asset a name' };
  if (!draft.branchName.trim()) return { ok: false, error: 'Choose a branch' };

  const dateProblem = installDateProblem(trimmed(draft.installedOn));
  if (dateProblem) return { ok: false, error: dateProblem };

  const id = equipmentIdFor(draft.branchName, name);
  const all = getEquipment();
  if (all.some((e) => e.id === id)) {
    return { ok: false, error: `${draft.branchName} already has an asset called “${name}”` };
  }

  const equipment: Equipment = {
    id,
    branchName: draft.branchName,
    name,
    category: draft.category,
    serialNumber: trimmed(draft.serialNumber),
    make: trimmed(draft.make),
    model: trimmed(draft.model),
    location: trimmed(draft.location),
    installedOn: trimmed(draft.installedOn),
    notes: trimmed(draft.notes),
    active: true,
    createdAt: now,
  };

  if (!write([...all, equipment])) {
    return { ok: false, error: 'There is no room left in this browser to store that' };
  }
  return { ok: true, equipment };
}

/**
 * Edits an asset in place.
 *
 * The id is left alone even when the name changes, because jobs already point
 * at it — a rename is a correction to what the unit is called, not a claim
 * that it is a different unit.
 */
export function updateEquipment(id: string, draft: EquipmentDraft): SaveEquipmentResult {
  const all = getEquipment();
  const existing = all.find((e) => e.id === id);
  if (!existing) return { ok: false, error: 'That asset is no longer on record' };

  const name = draft.name.trim();
  if (!name) return { ok: false, error: 'Give the asset a name' };

  const dateProblem = installDateProblem(trimmed(draft.installedOn));
  if (dateProblem) return { ok: false, error: dateProblem };

  const next: Equipment = {
    ...existing,
    name,
    category: draft.category,
    serialNumber: trimmed(draft.serialNumber),
    make: trimmed(draft.make),
    model: trimmed(draft.model),
    location: trimmed(draft.location),
    installedOn: trimmed(draft.installedOn),
    notes: trimmed(draft.notes),
  };

  if (!write(all.map((e) => (e.id === id ? next : e)))) {
    return { ok: false, error: 'There is no room left in this browser to store that' };
  }
  return { ok: true, equipment: next };
}

/** Sets or clears the interval this asset keeps instead of its category's. */
export function setPlanOverride(
  id: string,
  planId: string,
  months: number | null | undefined
): SaveEquipmentResult {
  const all = getEquipment();
  const existing = all.find((e) => e.id === id);
  if (!existing) return { ok: false, error: 'That asset is no longer on record' };

  const overrides = { ...(existing.planOverrides ?? {}) };
  if (months === undefined) delete overrides[planId];
  else overrides[planId] = months;

  const next: Equipment = {
    ...existing,
    planOverrides: Object.keys(overrides).length > 0 ? overrides : undefined,
  };
  if (!write(all.map((e) => (e.id === id ? next : e)))) {
    return { ok: false, error: 'Could not save that' };
  }
  return { ok: true, equipment: next };
}

export interface RemoveEquipmentResult {
  ok: boolean;
  /** True when it was archived rather than deleted, because jobs refer to it. */
  archived?: boolean;
  error?: string;
}

/**
 * Withdraws an asset.
 *
 * Deleted outright when nothing refers to it, archived when jobs do — the
 * same rule the branches and the checklist follow, and for the same reason:
 * a job naming an asset that no longer exists reads as a broken record rather
 * than a withdrawn one. `referencedIds` is passed in rather than read here so
 * this module does not have to know about jobs.
 */
export function removeEquipment(id: string, referencedIds: Set<string>): RemoveEquipmentResult {
  const all = getEquipment();
  if (!all.some((e) => e.id === id)) return { ok: false, error: 'That asset is no longer on record' };

  if (referencedIds.has(id)) {
    const next = all.map((e) => (e.id === id ? { ...e, active: false } : e));
    return write(next) ? { ok: true, archived: true } : { ok: false, error: 'Could not save that' };
  }
  return write(all.filter((e) => e.id !== id))
    ? { ok: true, archived: false }
    : { ok: false, error: 'Could not save that' };
}

/** Puts an archived asset back into service. */
export function restoreEquipment(id: string): SaveEquipmentResult {
  const all = getEquipment();
  const existing = all.find((e) => e.id === id);
  if (!existing) return { ok: false, error: 'That asset is no longer on record' };
  const next = { ...existing, active: true };
  return write(all.map((e) => (e.id === id ? next : e)))
    ? { ok: true, equipment: next }
    : { ok: false, error: 'Could not save that' };
}

export interface ImportResult {
  added: number;
  updated: number;
  skipped: { line: number; reason: string }[];
}

/**
 * Takes a whole appliance list at once.
 *
 * One asset per line, comma separated, in the order of the header the import
 * screen shows. An item already on record is updated rather than duplicated,
 * matched on the same derived id — so the operator can correct their
 * spreadsheet and paste it again without the register doubling.
 *
 * Rows that cannot be read are reported by line number rather than dropped:
 * an import that silently loses four of two hundred assets is worse than one
 * that says which four.
 */
export function importEquipment(
  rows: EquipmentDraft[],
  now: string
): { ok: boolean; result?: ImportResult; error?: string } {
  const all = getEquipment();
  const byId = new Map(all.map((e) => [e.id, e]));
  const skipped: { line: number; reason: string }[] = [];
  let added = 0;
  let updated = 0;

  rows.forEach((row, index) => {
    const name = row.name.trim();
    if (!name) {
      skipped.push({ line: index + 1, reason: 'no name' });
      return;
    }
    if (!row.branchName.trim()) {
      skipped.push({ line: index + 1, reason: 'no branch' });
      return;
    }
    const dateProblem = installDateProblem(trimmed(row.installedOn));
    if (dateProblem) {
      skipped.push({ line: index + 1, reason: dateProblem });
      return;
    }

    const id = equipmentIdFor(row.branchName, name);
    const existing = byId.get(id);
    const record: Equipment = {
      id,
      branchName: row.branchName,
      name,
      category: row.category,
      serialNumber: trimmed(row.serialNumber),
      make: trimmed(row.make),
      model: trimmed(row.model),
      location: trimmed(row.location),
      installedOn: trimmed(row.installedOn),
      notes: trimmed(row.notes),
      // An import never quietly revives something withdrawn on purpose
      planOverrides: existing?.planOverrides,
      active: existing ? existing.active : true,
      createdAt: existing?.createdAt ?? now,
    };

    byId.set(id, record);
    if (existing) updated += 1;
    else added += 1;
  });

  if (!write(Array.from(byId.values()))) {
    return { ok: false, error: 'There is no room left in this browser to store that list' };
  }
  return { ok: true, result: { added, updated, skipped } };
}

export function subscribeToEquipment(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
