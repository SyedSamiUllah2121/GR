import { Equipment, MaintenanceCategory, ServiceStatus } from '../types';
import { ASSET_REGISTER, SEGMENT_CATEGORY } from '../data/assetRegister';

/**
 * What the dropdowns on the equipment form offer.
 *
 * Every list here is the register's own vocabulary joined with whatever is
 * already on the operator's assets — so a brand somebody typed once is in the
 * list the next time, without a second store to keep in step and without a
 * code change. That is the whole mechanism: the register *is* the memory.
 *
 * Nothing here constrains what can be saved. These are suggestions on a
 * combobox, not an enum, because the alternative is a fitter standing in a
 * kitchen in front of a machine the list does not have, and no register is
 * ever finished. A value typed by hand is kept exactly as typed.
 */

/** Trim, collapse inner runs of spaces, drop the register's empty marker. */
export function tidy(value: string | null | undefined): string | null {
  const text = (value ?? '').replace(/\s+/g, ' ').trim();
  return text === '' || text === '-' || text === '—' ? null : text;
}

/**
 * Case-insensitive de-duplication that keeps the first spelling seen.
 *
 * First seen wins so the register's capitalisation beats a later typo:
 * "o general" typed in a hurry does not become a second brand beside
 * "O General", and does not overwrite it either.
 */
function unique(values: (string | null | undefined)[]): string[] {
  const seen = new Map<string, string>();
  for (const raw of values) {
    const value = tidy(raw);
    if (!value) continue;
    const key = value.toLowerCase();
    if (!seen.has(key)) seen.set(key, value);
  }
  return [...seen.values()];
}

/** Alphabetical, but case- and punctuation-insensitive so "O General" files under O. */
function sorted(values: string[]): string[] {
  return [...values].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

/**
 * Capacities in the order a fitter thinks of them: smallest tonnage first,
 * not alphabetical, or "1.5 Ton" would sort between "1 Ton" and "10 Ton" by
 * luck rather than by size. Anything with no number in it goes last.
 */
function byTonnage(values: string[]): string[] {
  const tons = (value: string) => {
    const match = value.match(/(\d+(?:\.\d+)?)/);
    return match ? Number(match[1]) : Number.POSITIVE_INFINITY;
  };
  return [...values].sort((a, b) => tons(a) - tons(b) || a.localeCompare(b));
}

export interface AssetOptions {
  /** Machine types, narrowed to the chosen category when it has any. */
  types: string[];
  makes: string[];
  capacities: string[];
  /** Places inside the chosen branch, its own first. */
  locations: string[];
}

/**
 * The lists to offer for one branch and one category.
 *
 * Narrowed rather than global, because the point of a dropdown is that the
 * right answer is near the top. A fitter adding a chiller at Royal Gujarat
 * wants that branch's twenty-five locations and the refrigeration types, not
 * all 302 assets' worth of everything — but the wider lists are appended
 * below the narrow ones rather than withheld, since a kitchen occasionally
 * does get a machine no branch has had before.
 */
export function assetOptionsFor(
  equipment: Equipment[],
  branchName: string | null,
  category: MaintenanceCategory | null
): AssetOptions {
  const registerRows = category
    ? ASSET_REGISTER.filter((a) => a.category === category)
    : ASSET_REGISTER;
  const ownRows = category
    ? equipment.filter((e) => e.category === category)
    : equipment;

  const inBranch = <T extends { branchName: string }>(rows: T[]) =>
    branchName ? rows.filter((r) => r.branchName === branchName) : rows;

  const types = sorted(
    unique([
      ...registerRows.map((a) => a.assetType),
      ...ownRows.map((e) => e.assetType ?? e.name),
    ])
  );

  /*
   * Makes and capacities are estate-wide on purpose. The brands are the same
   * eleven everywhere, and narrowing them to a branch would hide Mitsubishi
   * from a branch that happens not to have one yet.
   */
  const makes = sorted(
    unique([...ASSET_REGISTER.map((a) => a.make), ...equipment.map((e) => e.make)])
  );

  const capacities = byTonnage(
    unique([...ASSET_REGISTER.map((a) => a.capacity), ...equipment.map((e) => e.capacity)])
  );

  const branchLocations = sorted(
    unique([
      ...inBranch(ASSET_REGISTER).map((a) => a.location),
      ...inBranch(equipment).map((e) => e.location),
    ])
  );
  const elsewhere = sorted(
    unique([...ASSET_REGISTER.map((a) => a.location), ...equipment.map((e) => e.location)])
  ).filter((l) => !branchLocations.some((own) => own.toLowerCase() === l.toLowerCase()));

  return { types, makes, capacities, locations: [...branchLocations, ...elsewhere] };
}

/**
 * Which category a type belongs to, on the evidence of the register.
 *
 * Used when a type is picked before a category: choosing "Kulfi Freezer"
 * should put the asset under refrigeration without anybody being asked, since
 * the register has never filed one anywhere else. Returns null when the type
 * is new or genuinely appears under more than one trade, and the form then
 * leaves the category alone rather than guessing.
 */
export function categoryForType(type: string | null): MaintenanceCategory | null {
  const wanted = tidy(type)?.toLowerCase();
  if (!wanted) return null;
  const hits = new Set(
    ASSET_REGISTER.filter((a) => a.assetType.toLowerCase() === wanted).map((a) => a.category)
  );
  return hits.size === 1 ? [...hits][0] : null;
}

/** Whether a trade measures its units in tons — i.e. whether to show Capacity. */
export function usesCapacity(category: MaintenanceCategory | null): boolean {
  if (!category) return false;
  return ASSET_REGISTER.some((a) => a.category === category && a.capacity !== null);
}

/**
 * The register's own wording, read back into one of the app's states.
 *
 * The pasted-in list is the estate's paperwork, and its paperwork says
 * "SERVICE DUE" and "Serviced 25 Aug 2026", never 'due' or 'serviced'. This
 * reads both, so an operator can paste a column straight out of the master
 * document without translating it first.
 */
export function readServiceStatus(text: string | null | undefined): ServiceStatus | null {
  const value = tidy(text);
  if (!value) return null;
  const low = value.toLowerCase();

  if (low === 'serviced' || low === 'due' || low === 'pending' || low === 'faulty' ||
      low === 'inventory' || low === 'unknown') {
    return low as ServiceStatus;
  }
  if (low.includes('not working') || low.includes('faulty')) return 'faulty';
  if (low.includes('service due')) return 'due';
  if (low.includes('pending')) return 'pending';
  if (low.startsWith('serviced') || low.includes('service completed') || low.includes('cleaned')) {
    return 'serviced';
  }
  if (low.startsWith('installed')) return 'serviced';
  if (low.includes('not stated') || low.includes('to confirm') || low.includes('not recorded')) {
    return 'unknown';
  }
  return 'inventory';
}

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

/**
 * The service date buried in a status note — "Serviced 25 Aug 2026".
 *
 * Returns null rather than today when there is no date in the text, which is
 * the whole point: "Serviced - date not specified" is a unit that was
 * serviced on a day nobody recorded, and dating it now would have the
 * schedule count a fortnight that never happened.
 */
export function readServiceDate(text: string | null | undefined): string | null {
  const match = (text ?? '').match(/(\d{1,2})\s+([A-Za-z]{3})[a-z]*\s+(\d{4})/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = MONTHS[match[2].toLowerCase()];
  const year = Number(match[3]);
  if (!month || day < 1 || day > 31) return null;
  const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  // Guards 31 Feb and friends: the Date has to round-trip to the same day
  const parsed = new Date(`${iso}T00:00:00`);
  return Number.isNaN(parsed.getTime()) || parsed.getDate() !== day ? null : iso;
}

/** The segment an asset number uses for a category — `ACU`, `CHL`, `ELC`. */
export function assetSegmentFor(category: MaintenanceCategory): string {
  for (const [segment, mapped] of Object.entries(SEGMENT_CATEGORY)) {
    if (mapped === category) return segment;
  }
  /*
   * A trade the estate has not numbered yet. Three letters off the category
   * id — FIRE_SAFETY becomes FIR, PLUMBING becomes PLU — which is a guess,
   * but a legible one, and it keeps a new fire extinguisher numbered rather
   * than refused. The operator can overwrite it in the field.
   */
  const letters = category.replace(/[^A-Za-z]/g, '').toUpperCase();
  return (letters.slice(0, 3) || 'GEN').padEnd(3, 'X');
}

/** A provisional prefix for a branch with none, from its initials. */
export function assetPrefixFrom(branchName: string): string {
  const words = branchName.split(/[^A-Za-z0-9]+/).filter(Boolean);
  const initials = words.map((w) => w[0]).join('').toUpperCase();
  return (initials.slice(0, 4) || 'BR').padEnd(2, 'X');
}
