import { BRANCHES, Equipment, MaintenanceCategory } from '../types';

/**
 * The assets a fresh installation starts with.
 *
 * A small, plausible set — the things every one of these branches actually
 * has — so the register, the schedule and the board have something to show on
 * first run instead of three empty screens.
 *
 * It is a starting point, not an inventory. The operator's real appliance
 * list, with its serial numbers, replaces this through the import on the
 * Equipment screen; importing matches on the same derived id, so an asset
 * that appears in both is corrected rather than duplicated.
 */

/** The items every branch gets, spread across the trades that have plans. */
const PER_BRANCH: {
  name: string;
  category: MaintenanceCategory;
  location: string;
  make: string | null;
  model: string | null;
}[] = [
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

export const SEED_EQUIPMENT: Equipment[] = BRANCHES.flatMap((branch, branchIndex) =>
  PER_BRANCH.map((item, itemIndex) => ({
    id: `eq-${slug(branch.name)}-${slug(item.name)}`,
    branchName: branch.name,
    name: item.name,
    category: item.category,
    /*
     * Seeded assets carry no serial: inventing one would put a number on the
     * screen that matches nothing on the wall, and a wrong serial is worse
     * than a blank waiting to be filled in from the real list.
     */
    serialNumber: null,
    make: item.make,
    model: item.model,
    location: item.location,
    installedOn: INSTALLED[(branchIndex + itemIndex) % INSTALLED.length],
    notes: null,
    active: true,
    createdAt: '2026-01-01',
  }))
);
