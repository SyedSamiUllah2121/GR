import { BRANCHES, Equipment, Interval, MaintenanceCategory } from '../types';

/**
 * The assets a fresh installation starts with.
 *
 * A plausible restaurant's worth of kit at every branch — the fridges, the
 * air conditioners, the extinguishers, the oven, the water heater, the tills —
 * so the register, the schedule and the board have something real to show on
 * first run instead of three empty screens.
 *
 * It is a starting point, not an inventory. The operator's real appliance
 * list, with its own serial numbers, replaces this through the import on the
 * Equipment screen; importing matches on the same derived id, so an asset
 * that appears in both is corrected rather than duplicated.
 *
 * The list is APPEND-ONLY once shipped. Ids derive from the branch and the
 * name, and the seed merge matches on id alone, so renaming an entry here does
 * not rename it in a browser that already has it — it adds a second asset
 * beside the operator's edited original.
 */

interface SeedItem {
  name: string;
  category: MaintenanceCategory;
  location: string;
  make: string | null;
  model: string | null;
  /** A serial prefix, so the number on the screen at least looks like a plate. */
  serialPrefix?: string;
  /**
   * A cadence this one keeps instead of its category's, shown off deliberately
   * in the seed: the display fridge that is looked at fortnightly while the
   * rest go quarterly is the case the whole per-asset override exists for.
   */
  ownInterval?: Interval;
  /** Serviced by whoever leases it, so the estate raises nothing for it. */
  exempt?: boolean;
  notes?: string;
}

/** The items the first release shipped. Never edit these — only append below. */
const ORIGINAL: SeedItem[] = [
  {
    name: 'Counter printer',
    category: 'IT_EQUIPMENT',
    location: 'Front counter',
    make: 'Epson',
    model: 'TM-T88VI',
  },
  {
    name: 'Walk-in chiller',
    category: 'REFRIGERATION',
    location: 'Back kitchen',
    make: 'Carrier',
    model: 'CWC-220',
  },
  {
    name: 'Dining area AC 1',
    category: 'AC_VENTILATION',
    location: 'Dining area',
    make: 'Daikin',
    model: 'FTKF50',
  },
  {
    name: 'Kitchen extraction hood',
    category: 'AC_VENTILATION',
    location: 'Main kitchen',
    make: null,
    model: null,
  },
  {
    name: 'Fire extinguisher — kitchen',
    category: 'FIRE_SAFETY',
    location: 'Main kitchen',
    make: null,
    model: null,
  },
];

/** Added with the general-maintenance schedule, so every trade has something on it. */
const ADDED: SeedItem[] = [
  {
    name: 'Display fridge',
    category: 'REFRIGERATION',
    location: 'Front counter',
    make: 'Haier',
    model: 'SC-340',
    serialPrefix: 'HR',
    // On show to customers all day, so it gets looked at far more often than
    // the chiller in the back — the reason a per-asset interval exists
    ownInterval: { every: 14, unit: 'days' },
    notes: 'Customer-facing. Glass and seals checked with every service.',
  },
  {
    name: 'Under-counter freezer',
    category: 'REFRIGERATION',
    location: 'Prep area',
    make: 'Hoshizaki',
    model: 'UCF-120',
    serialPrefix: 'HZ',
  },
  {
    name: 'Dining area AC 2',
    category: 'AC_VENTILATION',
    location: 'Dining area',
    make: 'Daikin',
    model: 'FTKF50',
    serialPrefix: 'DK',
  },
  {
    name: 'Fire extinguisher — dining',
    category: 'FIRE_SAFETY',
    location: 'Dining area',
    make: 'Naffco',
    model: 'ABC-6kg',
    serialPrefix: 'NF',
  },
  {
    name: 'Main oven',
    category: 'COOKING_EQUIPMENT',
    location: 'Main kitchen',
    make: 'Rational',
    model: 'iCombi Pro 6',
    serialPrefix: 'RT',
  },
  {
    name: 'Water heater',
    category: 'WATER_HEATING',
    location: 'Back kitchen',
    make: 'Ariston',
    model: 'PRO1-R80',
    serialPrefix: 'AR',
  },
  {
    name: 'CCTV recorder',
    category: 'SECURITY',
    location: 'Office',
    make: 'Hikvision',
    model: 'DS-7608NI',
    serialPrefix: 'HK',
  },
  {
    name: 'Gas bank',
    category: 'GAS',
    location: 'Rear yard',
    make: null,
    model: null,
    serialPrefix: 'GB',
  },
  {
    name: 'Leased coffee machine',
    category: 'COOKING_EQUIPMENT',
    location: 'Front counter',
    make: 'La Cimbali',
    model: 'M26',
    serialPrefix: 'LC',
    // The lessor services it on their own contract, so the estate raising work
    // for it would send somebody to a machine they are not allowed to open
    exempt: true,
    notes: 'On the supplier’s contract — they service it, we do not.',
  },
];

const PER_BRANCH: SeedItem[] = [...ORIGINAL, ...ADDED];

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

/*
 * Installation dates are staggered by branch rather than all set to one day,
 * so the schedule that runs off them comes due at different times and the
 * board does not fill with every service in the estate on the same morning.
 */
const INSTALLED = [
  '2025-02-10',
  '2025-04-22',
  '2025-06-05',
  '2025-08-18',
  '2025-10-02',
  '2025-11-14',
  '2026-01-09',
];

/** Exactly as `generalPlanIdFor` derives it, which is where the override is read. */
function generalPlanId(category: MaintenanceCategory): string {
  return `plan-${category.toLowerCase()}-general-maintenance`;
}

function overridesFor(item: SeedItem): Record<string, Interval | null> | undefined {
  if (item.exempt) return { [generalPlanId(item.category)]: null };
  if (item.ownInterval) return { [generalPlanId(item.category)]: item.ownInterval };
  return undefined;
}

export const SEED_EQUIPMENT: Equipment[] = BRANCHES.flatMap((branch, branchIndex) =>
  PER_BRANCH.map((item, itemIndex) => ({
    id: `eq-${slug(branch.name)}-${slug(item.name)}`,
    branchName: branch.name,
    name: item.name,
    category: item.category,
    /*
     * The five original assets carry no serial on purpose: inventing one would
     * have put a number on the screen matching nothing on the wall. The ones
     * added since do carry one, because a register whose serial column is
     * empty everywhere does not show what the column is for — and these are
     * plainly demo numbers rather than plausible-looking real ones.
     */
    serialNumber: item.serialPrefix
      ? `${item.serialPrefix}-${(branchIndex + 1) * 100 + itemIndex}-DEMO`
      : null,
    make: item.make,
    model: item.model,
    location: item.location,
    installedOn: INSTALLED[(branchIndex + itemIndex) % INSTALLED.length],
    notes: item.notes ?? null,
    planOverrides: overridesFor(item),
    active: true,
    createdAt: '2026-01-01',
  }))
);
