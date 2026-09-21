import { Equipment, Interval, MaintenanceCategory, ServiceStatus } from '../types';
import { ensureEstate } from './estateReset';
import { SEED_EQUIPMENT, equipmentIdForAssetNo } from '../data/seedEquipment';
import { ASSET_REGISTER } from '../data/assetRegister';
import { assetSegmentFor, assetPrefixFrom, tidy } from './assetOptions';
import { getBranches } from './branchStore';
import { isRealIsoDay, isUsableInterval } from './maintenanceSchedule';
import { generalPlanIdFor } from './maintenancePlanStore';

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
 * The versions are listed at the constant below.
 */
/**
 *   1  the estate's own register — 302 units read off the AC, chiller and
 *      electrical master documents of 17 September 2026
 *
 * The count restarts here. What came before was an invented estate, not an
 * earlier version of this one, and `estateReset` clears it rather than
 * migrating it.
 */
const SEED_VERSION = 1;
const SEED_VERSION_KEY = 'inspection_log_equipment_seed_version';

function notify(): void {
  window.dispatchEvent(new Event(EVENT));
}

/**
 * Why the register on screen is not the register this build ships, if it is not.
 *
 * There is exactly one way for that to happen and it used to be invisible: the
 * seed merge is a single `localStorage` write of about 124KB, and this app
 * keeps inspection photographs in the same store. When that write is refused
 * for want of room, `getEquipment` returns what was already there — the right
 * call, since half a register is worse than an old one — marks nothing, and
 * retries on the next load, where it fails again.
 *
 * The result is an app that shows the previous estate for ever and explains
 * itself only in the browser console. That is the failure this records, so the
 * register screen can say so in words and name the way out.
 */
let seedProblem: string | null = null;

/** The reason the shipped register could not be applied, or null when it could. */
export function equipmentSeedProblem(): string | null {
  return seedProblem;
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
 * Adds any shipped asset this store has not seen, matched by id.
 *
 * A plain merge. There is no old estate to reconcile against — `estateReset`
 * removes the previous store outright rather than migrating it — so this is
 * only what it says: a browser that was seeded before an asset was added to
 * the register gains that asset, and everything the operator has edited is
 * left exactly as they left it.
 *
 * Returns the array it was given, unchanged and by identity, when there is
 * nothing to do, which is what lets the caller mark the seed applied without
 * a pointless write.
 */
function applySeed(current: Equipment[]): Equipment[] {
  const known = new Set(current.map((e) => e.id));
  const missing = SEED_EQUIPMENT.filter((e) => !known.has(e.id));
  return missing.length === 0 ? current : [...current, ...missing];
}

/**
 * Every asset on record, archived ones included.
 *
 * Merges in any seed items this store has not seen, matched by id, so an
 * installation already in use gains later additions without losing the
 * operator's own entries or their edits to the seeded ones.
 */
export function getEquipment(): Equipment[] {
  ensureEstate();
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

    const merged = applySeed(current);
    if (merged === current) {
      seedProblem = null;
      markSeeded();
      return current;
    }

    /*
     * Written before the marker, not after. Marking first meant a browser that
     * was full at the moment of a version bump recorded the seed as applied
     * and lost the new assets with no retry — `branchStore` has the ordering
     * right and says why.
     */
    if (!write(merged)) {
      seedProblem =
        `The register in this browser could not be replaced — there is no room left to store ` +
        `${merged.length} assets. Nothing has been lost, and the old list is still here, but it ` +
        `is not the register this version ships. Clearing old inspection photographs frees the ` +
        `space, and the estate loads on the next refresh.`;
      return current;
    }
    seedProblem = null;
    markSeeded();
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
 * The id an asset gets, so importing the same list twice lands on the same
 * records rather than doubling the register.
 *
 * Derived from the asset number when there is one, and from the branch and
 * the name when there is not. The asset number is the better key by a long
 * way, and the register shows why: Royal Gujarat has eleven assets called
 * "Fan" and Nana House has nine called "Refrigerator", and the name-derived
 * id folded each of those groups into one record — nine fridges arriving as
 * one, with eight of them silently overwriting each other on the way in.
 *
 * The old form is kept for the assets that have no number. It is not a
 * fallback that will quietly go away: a hand-written register is allowed to
 * have units nobody has tagged yet.
 */
export function equipmentIdFor(
  branchName: string,
  name: string,
  assetNo?: string | null
): string {
  const tagged = tidy(assetNo);
  if (tagged) return equipmentIdForAssetNo(tagged);
  const slug = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `eq-${slug(branchName)}-${slug(name) || 'item'}`;
}

/** The letters a branch's asset numbers start with. */
export function assetPrefixFor(branchName: string): string {
  const branch = getBranches().find((b) => b.name === branchName);
  return tidy(branch?.assetPrefix) ?? assetPrefixFrom(branchName);
}

/**
 * The next asset number free for a branch and a trade — `RG-CHL-094`.
 *
 * The counter is estate-wide, not per branch, because that is how the master
 * registers number: chillers run 001 to 093 straight through all nine
 * branches, so the next one is 094 whichever branch buys it. Numbering per
 * branch instead would hand out `RG-CHL-022` while `DGR-CHL-022` already
 * existed, and two assets a fortnight apart would be quoting the same tail.
 *
 * Reads both the shipped register and whatever is on record, including
 * archived assets. A withdrawn unit's number is never reissued: the estate's
 * paperwork still refers to it, and a second `RG-ACU-014` would make that
 * paperwork ambiguous forever.
 */
export function nextAssetNo(
  branchName: string,
  category: MaintenanceCategory,
  all: Equipment[] = getEquipment()
): string {
  const segment = assetSegmentFor(category);
  const used = [
    ...ASSET_REGISTER.map((a) => a.assetNo),
    ...all.map((e) => e.assetNo ?? ''),
  ];

  let highest = 0;
  for (const assetNo of used) {
    const match = tidy(assetNo)?.match(/^([A-Za-z]+)-([A-Za-z]+)-(\d+)$/);
    if (!match) continue;
    if (match[2].toUpperCase() !== segment) continue;
    highest = Math.max(highest, Number(match[3]));
  }

  const width = Math.max(3, String(highest + 1).length);
  return `${assetPrefixFor(branchName)}-${segment}-${String(highest + 1).padStart(width, '0')}`;
}

/**
 * Why an asset number cannot be used, or null when it is fine.
 *
 * Blank is fine — an untagged unit is still an asset. What is refused is a
 * number another asset already holds, because the id is derived from it and
 * saving the second one would overwrite the first.
 */
export function assetNoProblem(
  assetNo: string | null,
  selfId: string | null,
  all: Equipment[] = getEquipment()
): string | null {
  const value = tidy(assetNo);
  if (!value) return null;
  if (!/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/.test(value)) {
    return `“${value}” is not an asset number — use letters, numbers and dashes`;
  }
  const clash = all.find(
    (e) => e.id !== selfId && tidy(e.assetNo)?.toLowerCase() === value.toLowerCase()
  );
  if (clash) {
    return `${clash.branchName} already has ${value}${
      clash.active ? '' : ' — it is withdrawn, but the number stays taken'
    }`;
  }
  return null;
}

export interface EquipmentDraft {
  branchName: string;
  name: string;
  category: MaintenanceCategory;
  /** The estate's number for it. Blank is allowed; a duplicate is not. */
  assetNo?: string | null;
  assetType?: string | null;
  capacity?: string | null;
  quantity?: number | null;
  serviceStatus?: ServiceStatus;
  statusNote?: string | null;
  lastServicedOn?: string | null;
  serialNumber?: string | null;
  make?: string | null;
  model?: string | null;
  location?: string | null;
  installedOn?: string | null;
  notes?: string | null;
  /**
   * The intervals this asset keeps instead of its category's.
   *
   * Carried on the draft rather than written through `setPlanOverride`
   * afterwards, so saving an asset is one write and one change event. Two
   * writes in sequence would fire `notify` twice and re-read storage in
   * between, and the screens would repaint on a half-saved record.
   */
  planOverrides?: Record<string, Interval | number | null>;
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
 * The register fields, read off a draft the same way wherever it came from.
 *
 * One function rather than the same eight lines in `addEquipment`,
 * `updateEquipment` and `importEquipment`, because the last time those three
 * were written out separately one of them forgot a field and the import
 * quietly dropped every capacity it was given.
 *
 * `quantity` is floored at one: the register counts units, and a line
 * covering zero of something is a line that should not have been written.
 */
function registerFieldsOf(draft: EquipmentDraft): Pick<
  Equipment,
  'assetNo' | 'assetType' | 'capacity' | 'quantity' | 'serviceStatus' | 'statusNote' | 'lastServicedOn'
> {
  const quantity = Number(draft.quantity ?? 1);
  return {
    assetNo: trimmed(draft.assetNo),
    assetType: trimmed(draft.assetType),
    capacity: trimmed(draft.capacity),
    quantity: Number.isFinite(quantity) && quantity >= 1 ? Math.floor(quantity) : 1,
    serviceStatus: draft.serviceStatus ?? 'inventory',
    statusNote: trimmed(draft.statusNote),
    lastServicedOn: trimmed(draft.lastServicedOn),
  };
}

/**
 * Why a service date cannot be used, or null when it is fine.
 *
 * The same rule the install date keeps, and for the same reason: the schedule
 * counts the next service from whichever of the two is later, so an
 * impossible day would anchor a plan to a date nobody meant.
 */
function serviceDateProblem(value: string | null): string | null {
  if (value === null) return null;
  if (!isRealIsoDay(value)) return `“${value}” is not a real date — use YYYY-MM-DD`;
  return null;
}

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

/**
 * Keeps nonsense out of the overrides, at the write.
 *
 * A NaN interval cannot be repaired at the read, which is why it is stopped
 * here: `JSON.stringify` turns NaN into `null`, and `null` in this map means
 * "exempt". So a mistyped number does not fail loudly — it survives the reload
 * as a deliberate-looking exemption, and the asset simply stops being
 * serviced. Anything that is not a usable cadence is dropped rather than
 * stored, leaving the asset on its category's rule.
 */
function cleanOverrides(
  overrides: Record<string, Interval | number | null> | undefined
): Record<string, Interval | number | null> | undefined {
  if (!overrides) return undefined;
  const out: Record<string, Interval | number | null> = {};
  Object.entries(overrides).forEach(([planId, value]) => {
    if (value === null) {
      out[planId] = null;
      return;
    }
    if (typeof value === 'number') {
      if (Number.isInteger(value) && value > 0) out[planId] = value;
      return;
    }
    if (isUsableInterval(value)) out[planId] = { every: value.every, unit: value.unit };
  });
  return Object.keys(out).length > 0 ? out : undefined;
}

/** The overrides without the general-maintenance key for a given category. */
function withoutGeneralOf(
  category: MaintenanceCategory,
  overrides: Record<string, Interval | number | null> | undefined
): Record<string, Interval | number | null> | undefined {
  if (!overrides) return undefined;
  const { [generalPlanIdFor(category)]: _dropped, ...rest } = overrides;
  return rest;
}

/** Adds an asset, refusing a nameless one and a duplicate of one on record. */
export function addEquipment(draft: EquipmentDraft, now: string): SaveEquipmentResult {
  const name = draft.name.trim();
  if (!name) return { ok: false, error: 'Give the asset a name' };
  if (!draft.branchName.trim()) return { ok: false, error: 'Choose a branch' };

  const dateProblem = installDateProblem(trimmed(draft.installedOn));
  if (dateProblem) return { ok: false, error: dateProblem };
  const servicedProblem = serviceDateProblem(trimmed(draft.lastServicedOn));
  if (servicedProblem) return { ok: false, error: servicedProblem };

  const all = getEquipment();
  const numberProblem = assetNoProblem(trimmed(draft.assetNo), null, all);
  if (numberProblem) return { ok: false, error: numberProblem };

  const id = equipmentIdFor(draft.branchName, name, draft.assetNo);
  if (all.some((e) => e.id === id)) {
    /*
     * Two ways to land here and they need different words. With a number, the
     * clash is the number and `assetNoProblem` has already said so — this is
     * the untagged case, where the branch and the name are the whole identity
     * and a second "Fryer" in the same kitchen genuinely cannot be told from
     * the first. Giving it a number is the way out, so the message says so.
     */
    return {
      ok: false,
      error: `${draft.branchName} already has an asset called “${name}” — give this one an asset number to tell them apart`,
    };
  }

  const equipment: Equipment = {
    id,
    branchName: draft.branchName,
    name,
    category: draft.category,
    ...registerFieldsOf(draft),
    serialNumber: trimmed(draft.serialNumber),
    make: trimmed(draft.make),
    model: trimmed(draft.model),
    location: trimmed(draft.location),
    installedOn: trimmed(draft.installedOn),
    notes: trimmed(draft.notes),
    planOverrides: cleanOverrides(draft.planOverrides),
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
  const servicedProblem = serviceDateProblem(trimmed(draft.lastServicedOn));
  if (servicedProblem) return { ok: false, error: servicedProblem };
  const numberProblem = assetNoProblem(trimmed(draft.assetNo), id, all);
  if (numberProblem) return { ok: false, error: numberProblem };

  const next: Equipment = {
    ...existing,
    name,
    category: draft.category,
    /*
     * The id is not rebuilt from a corrected asset number, deliberately. Jobs
     * point at the id, and a unit whose tag was typed in wrong is the same
     * unit — renumbering the record would strand every service ever carried
     * out on it. The number on the record is corrected; the key stays.
     */
    ...registerFieldsOf(draft),
    /*
     * An override is keyed by a plan id, and a general plan id is built from
     * the category — so moving an asset to another trade leaves its old
     * general override pointing at a plan that no longer applies to it. Pruned
     * narrowly: only the general key, and only when the category actually
     * changed, so a named-service override survives a re-filing.
     *
     * A draft that says nothing about overrides is not a draft that clears
     * them. The asset form sends the whole map back, but a caller that only
     * means to correct a serial number must not silently withdraw an asset
     * from its schedule — an exemption nobody remembers making is exactly the
     * bug this field is most likely to cause.
     */
    ...(() => {
      const kept = draft.planOverrides === undefined ? existing.planOverrides : draft.planOverrides;
      return {
        planOverrides: cleanOverrides(
          draft.category !== existing.category ? withoutGeneralOf(existing.category, kept) : kept
        ),
      };
    })(),
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

/**
 * Sets or clears the interval this asset keeps instead of its category's.
 *
 * Three arguments and three meanings: an `Interval` is its own cadence, `null`
 * exempts it, and `undefined` puts it back on the category's rule.
 */
export function setPlanOverride(
  id: string,
  planId: string,
  interval: Interval | null | undefined
): SaveEquipmentResult {
  const all = getEquipment();
  const existing = all.find((e) => e.id === id);
  if (!existing) return { ok: false, error: 'That asset is no longer on record' };
  if (interval && !isUsableInterval(interval)) {
    return { ok: false, error: 'An interval has to be a whole number of days or months' };
  }

  const overrides = { ...(existing.planOverrides ?? {}) };
  if (interval === undefined) delete overrides[planId];
  else overrides[planId] = interval;

  const next: Equipment = {
    ...existing,
    planOverrides: Object.keys(overrides).length > 0 ? overrides : undefined,
  };
  if (!write(all.map((e) => (e.id === id ? next : e)))) {
    return { ok: false, error: 'Could not save that' };
  }
  return { ok: true, equipment: next };
}

/** "2026-09-22" → "22 Sep 2026", the wording the master registers use. */
function registerDate(day: string): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const [y, m, d] = day.split('-').map(Number);
  if (!y || !m || !d) return day;
  return `${d} ${months[m - 1]} ${y}`;
}

/**
 * Brings an asset's recorded status back in line once the work is done.
 *
 * Without this the register lies, permanently and visibly. Thirty-three air
 * conditioners arrive stamped "SERVICE DUE"; a fitter services one and closes
 * the job; the schedule correctly moves on, because it counts from the
 * completed job — but the asset's own record still says SERVICE DUE, so the
 * register screen shows a red pill, the status filter still counts it among
 * the overdue, and the one place a manager looks to answer "what still needs
 * doing" answers wrongly for ever.
 *
 * The status is a claim about the asset, and completing the work changes what
 * is true about the asset. So the claim is rewritten, in the register's own
 * wording — "Serviced 22 Sep 2026" — rather than in this app's vocabulary,
 * because the next person to export this register should not be able to tell
 * which lines the app wrote.
 *
 * A repair is not a service and does not claim to be one. Fixing a unit that
 * did not run clears the breakdown and says so; it does not assert that the
 * routine service was carried out, because it was not.
 *
 * Silent when the asset is gone or the write fails: this runs after work that
 * has already been recorded, and refusing to acknowledge a completed repair
 * because a cosmetic field could not be updated would be the wrong trade.
 */
export function reconcileServiceStatus(
  equipmentId: string | null | undefined,
  completedOn: string,
  kind: 'scheduled' | 'problem'
): void {
  if (!equipmentId) return;
  const day = completedOn.slice(0, 10);
  if (!isRealIsoDay(day)) return;

  const all = getEquipment();
  const existing = all.find((e) => e.id === equipmentId);
  if (!existing) return;

  const next: Equipment =
    kind === 'scheduled'
      ? {
          ...existing,
          serviceStatus: 'serviced',
          lastServicedOn: day,
          statusNote: `Serviced ${registerDate(day)}`,
        }
      : existing.serviceStatus === 'faulty'
        ? {
            ...existing,
            /*
             * Back on the inventory, not "serviced". The unit runs again and
             * the register should stop saying it does not — but nobody washed
             * its filters, and a status that claimed they had would put the
             * next routine service off by a full interval.
             */
            serviceStatus: 'inventory',
            statusNote: `Repaired ${registerDate(day)}`,
          }
        : existing;

  if (next === existing) return;
  write(all.map((e) => (e.id === equipmentId ? next : e)));
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
  /** Ids written by this paste, so one list cannot merge two of its own rows. */
  const seenThisImport = new Set<string>();
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
    const servicedProblem = serviceDateProblem(trimmed(row.lastServicedOn));
    if (servicedProblem) {
      skipped.push({ line: index + 1, reason: servicedProblem });
      return;
    }

    const id = equipmentIdFor(row.branchName, name, row.assetNo);

    /*
     * A line this same paste has already written.
     *
     * Tracked separately from the store, and that separation is the whole
     * point. Matching against the store cannot catch this: the id is derived
     * from the asset number, so two lines carrying `RG-ACU-014` derive the
     * *same* id and the second reads as a correction of the first rather than
     * a collision — which is exactly right when a corrected register is
     * pasted again, and exactly wrong within one paste, where it silently
     * merges two units into one and loses a machine.
     *
     * Reported rather than merged even when the two lines are identical. A
     * register in which one asset number appears twice has a problem either
     * way, and the operator is the one who can tell a typo from a duplicate.
     */
    if (seenThisImport.has(id)) {
      const assetNo = trimmed(row.assetNo);
      skipped.push({
        line: index + 1,
        reason: assetNo
          ? `${assetNo} appears more than once in this list`
          : `${row.branchName} already has a “${name}” earlier in this list — give them asset numbers to tell them apart`,
      });
      return;
    }
    seenThisImport.add(id);

    const existing = byId.get(id);
    const record: Equipment = {
      id,
      branchName: row.branchName,
      name,
      category: row.category,
      ...registerFieldsOf(row),
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
