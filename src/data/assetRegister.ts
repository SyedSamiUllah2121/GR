import { MaintenanceCategory, ServiceStatus } from '../types';

/**
 * The estate's real asset register, as recorded on 17 September 2026.
 *
 * Three master documents transcribed verbatim — the AC register (ACU 001-091),
 * the chiller record (CHL 001-093) and the electrical register (ELC 001-118) —
 * 302 assets across nine branches:
 *
 *   Nana House - Shabiya 11             24
 *   Royal Gujarat                       73
 *   Mussafah 17 - Delight Gujarat       36
 *   Shabiya 12 - Gujarat Restaurants    15
 *   Nana House - Shabiya 10             21
 *   Mafraq Gujarat Restaurant           37
 *   Manpasand - New Store               35
 *   Mussafah 26 - Gujarat Hotel         35
 *   Mussafah 26 - Zaharat Gujarat       26
 *
 * The asset number is the identity. It is printed on the unit, it is what the
 * branch says on the phone, and it is what the estate's own paperwork is
 * filed under, so every equipment id in this app derives from it rather than
 * from the branch and the name. That is the fix for the register's oldest
 * problem: eleven assets at Royal Gujarat are called "Fan" and four at
 * Nana House are called "Refrigerator", and a name-derived id collapsed them
 * into one record.
 *
 * The prefix before the dash names the branch and the middle segment names
 * the trade, so `RG-CHL-021` reads as Royal Gujarat, refrigeration, unit 21 —
 * and the number runs continuously across the whole estate rather than
 * restarting per branch, which is how the source documents number them and
 * the only way `nextAssetNo` can hand out one that is genuinely free.
 *
 * `statusNote` is the register's own wording kept exactly as written —
 * "SERVICE DUE", "Serviced 25 Aug 2026", "Unit 1 of 2". `status` is that
 * wording sorted into the handful of states the app can filter and colour by.
 * Both are kept because the note says things the status cannot: which of two
 * identical shake machines this is, or that an AC was serviced on a date
 * nobody wrote down.
 *
 * Generated, not typed. Re-transcribing a document by hand is how a register
 * acquires a fridge that does not exist.
 */

/** `[assetNo, type, capacity, make, location, status, statusNote, lastServicedOn]` */
type Row = [
  string,
  string,
  string | null,
  string | null,
  string | null,
  ServiceStatus,
  string | null,
  string | null,
];

const ROWS: Row[] = [
  ['NHB-ACU-001', 'Split AC', '1.5 Ton', 'Hitachi', 'Hall', 'serviced', 'Serviced 12 Aug 2026', '2026-08-12'],
  ['NHB-ACU-002', 'Split AC', '1.5 Ton', 'Super General', 'Hall', 'serviced', 'Serviced 12 Aug 2026', '2026-08-12'],
  ['NHB-ACU-003', 'Split AC', '2 Ton', 'O General', 'Kitchen', 'due', 'SERVICE DUE', null],
  ['NHB-ACU-004', 'Split AC', '2 Ton', 'O General', 'Kitchen', 'due', 'SERVICE DUE', null],
  ['NHB-ACU-005', 'Split AC', '2 Ton', 'Gree', 'Fruit Chaat Area', 'due', 'SERVICE DUE', null],
  ['NHB-ACU-006', 'Floor-Standing AC', '3 Ton', 'Super General', 'Hall', 'serviced', 'Serviced 12 Aug 2026', '2026-08-12'],
  ['NHB-ACU-007', 'Split AC', '1.5 Ton', 'Hitachi', 'Family Hall', 'serviced', 'Serviced 12 Aug 2026', '2026-08-12'],
  ['RG-ACU-008', 'Split AC', '2.5 Ton', 'Mitsubishi', 'Juice & Sweets', 'due', 'SERVICE DUE', null],
  ['RG-ACU-009', 'Split AC', '2.5 Ton', 'Mitsubishi', 'Juice & Sweets', 'due', 'SERVICE DUE', null],
  ['RG-ACU-010', 'Split AC', '2.5 Ton', 'Mitsubishi', 'Juice & Sweets / Bar', 'serviced', 'Serviced 20 Aug 2026', '2026-08-20'],
  ['RG-ACU-011', 'Split AC', '2 Ton', 'Midea', 'Live Kitchen', 'serviced', 'Serviced 20 Aug 2026', '2026-08-20'],
  ['RG-ACU-012', 'Split AC', '2.5 Ton', 'O General', 'Live Kitchen', 'serviced', 'Serviced 20 Aug 2026', '2026-08-20'],
  ['RG-ACU-013', 'Split AC', '2.5 Ton', 'O General', 'Main Kitchen', 'due', 'SERVICE DUE', null],
  ['RG-ACU-014', 'Split AC', '2.5 Ton', 'O General', 'Main Kitchen', 'due', 'SERVICE DUE', null],
  ['RG-ACU-015', 'Split AC', '2 Ton', 'Mitsubishi', 'Tandoor Area', 'serviced', 'Serviced 1 Sep 2026', '2026-09-01'],
  ['RG-ACU-016', 'Split AC', '3 Ton', 'Midea', 'Tandoor Area', 'serviced', 'Serviced 1 Sep 2026', '2026-09-01'],
  ['RG-ACU-017', 'Split AC', '2 Ton', 'Mitsubishi', 'Dish Wash Area', 'serviced', 'Serviced 1 Sep 2026', '2026-09-01'],
  ['RG-ACU-018', 'Split AC', '1.5 Ton', 'Midea', 'Vegetable Store', 'due', 'SERVICE DUE', null],
  ['RG-ACU-019', 'Split AC', '1.5 Ton', 'Midea', 'Chinese Food Store', 'due', 'SERVICE DUE', null],
  ['RG-ACU-020', 'Split AC', '2 Ton', 'Mitsubishi', 'Pantry Area', 'due', 'SERVICE DUE', null],
  ['RG-ACU-021', 'Split AC', '2 Ton', 'Mitsubishi', 'Pantry Area', 'due', 'SERVICE DUE', null],
  ['RG-ACU-022', 'Split AC', '2.5 Ton', 'O General', 'BBQ Area', 'serviced', 'Serviced 6 Sep 2026', '2026-09-06'],
  ['RG-ACU-023', 'Split AC', '2.5 Ton', 'O General', 'Downstairs Main Hall', 'serviced', 'Serviced 15 Aug 2026', '2026-08-15'],
  ['RG-ACU-024', 'Split AC', '2.5 Ton', 'O General', 'Downstairs Main Hall', 'serviced', 'Serviced 15 Aug 2026', '2026-08-15'],
  ['RG-ACU-025', 'Floor-Standing AC', '3 Ton', 'Midea', 'Downstairs Main Hall', 'serviced', 'Installed 15 Aug 2026', '2026-08-15'],
  ['RG-ACU-026', 'Floor-Standing AC', '3 Ton', 'Super General', 'Upstairs Hall', 'due', 'SERVICE DUE', null],
  ['RG-ACU-027', 'Floor-Standing AC', '3 Ton', 'Super General', 'Upstairs Hall', 'due', 'SERVICE DUE', null],
  ['DGR-ACU-028', 'Split AC', '3 Ton', 'Super General', 'Main Hall', 'serviced', 'Serviced 19 Aug 2026', '2026-08-19'],
  ['DGR-ACU-029', 'Split AC', '3 Ton', 'Super General', 'Main Hall', 'serviced', 'Serviced 19 Aug 2026', '2026-08-19'],
  ['DGR-ACU-030', 'Split AC', '3 Ton', 'Mitsubishi', 'Main Hall', 'serviced', 'Serviced 19 Aug 2026', '2026-08-19'],
  ['DGR-ACU-031', 'Split AC', '3.75 Ton', 'O General', 'Family Hall', 'faulty', 'NOT WORKING / FAULTY', null],
  ['DGR-ACU-032', 'Split AC', '3.75 Ton', 'O General', 'Family Hall', 'due', 'SERVICE DUE', null],
  ['DGR-ACU-033', 'Split AC', '3.75 Ton', 'O General', 'Family Hall', 'due', 'SERVICE DUE', null],
  ['DGR-ACU-034', 'Split AC', '3.75 Ton', 'O General', 'Family Hall', 'due', 'SERVICE DUE', null],
  ['DGR-ACU-035', 'Floor-Standing AC', '3 Ton', 'Generaltec', 'Main Hall (Downstairs)', 'due', 'SERVICE DUE', null],
  ['DGR-ACU-036', 'Split AC', '2.5 Ton', 'O General', 'Kitchen / Kitchen Area', 'serviced', 'Serviced 19 Aug 2026', '2026-08-19'],
  ['DGR-ACU-037', 'Split AC', '2.5 Ton', 'O General', 'Kitchen / Kitchen Area', 'serviced', 'Serviced 19 Aug 2026', '2026-08-19'],
  ['DGR-ACU-038', 'Split AC', '2.5 Ton', 'O General', 'Kitchen / Kitchen Area', 'serviced', 'Serviced 19 Aug 2026', '2026-08-19'],
  ['GRSB-ACU-039', 'Split AC', '2 Ton', 'Gree', 'Hall', 'pending', 'SERVICE PENDING', null],
  ['GRSB-ACU-040', 'Floor-Standing AC', '3 Ton', 'Super General', 'Hall', 'due', 'SERVICE DUE', null],
  ['GRSB-ACU-041', 'Split AC', '2 Ton', 'Super General', 'Kitchen', 'due', 'SERVICE DUE', null],
  ['GRSB-ACU-042', 'Split AC', 'Approx. 2.35 Ton', 'General indoor + Super General outdoor', 'Kitchen', 'serviced', 'Service completed', null],
  ['NH-ACU-043', 'Split AC', '1.5 Ton', 'Gree', 'Hall', 'pending', 'Service mapping pending*', null],
  ['NH-ACU-044', 'Split AC', '2 Ton', 'Midea', 'Hall', 'pending', 'Service mapping pending*', null],
  ['MGR-ACU-045', 'Split AC', '3 Ton', 'Gree', 'Family Hall', 'serviced', 'Serviced 14 Aug 2026', '2026-08-14'],
  ['MGR-ACU-046', 'Split AC', '3 Ton', 'Gree', 'Family Hall', 'serviced', 'Serviced 18 Aug 2026', '2026-08-18'],
  ['MGR-ACU-047', 'Split AC', '3 Ton', 'General', 'Main Hall / Fruit Chaat', 'serviced', 'Serviced 25 Aug 2026', '2026-08-25'],
  ['MGR-ACU-048', 'Split AC', '3 Ton', 'General', 'Main Hall', 'serviced', 'Serviced 25 Aug 2026', '2026-08-25'],
  ['MGR-ACU-049', 'Split AC', '3 Ton', 'General', 'Main Hall', 'serviced', 'Serviced 25 Aug 2026', '2026-08-25'],
  ['MGR-ACU-050', 'Split AC', '3 Ton', 'Midea', 'Main Kitchen', 'serviced', 'Serviced 25 Aug 2026', '2026-08-25'],
  ['MGR-ACU-051', 'Floor-Standing AC', '2.75 Ton', 'Super General', 'Main Hall', 'due', 'SERVICE DUE', null],
  ['MGR-ACU-052', 'Floor-Standing AC', '2.75 Ton', 'Midea', 'Main Hall', 'due', 'SERVICE DUE', null],
  ['MGR-ACU-053', 'Split AC', '2 Ton', 'Midea', 'Pizza Section', 'serviced', 'Serviced 25 Aug 2026', '2026-08-25'],
  ['MGR-ACU-054', 'Split AC', '2 Ton', 'Midea', 'Vegetable Cutting / Store', 'serviced', 'Serviced 25 Aug 2026', '2026-08-25'],
  ['MGR-ACU-055', 'Split AC', '1 Ton', 'Midea', 'Dishwash Area', 'serviced', 'Serviced 25 Aug 2026', '2026-08-25'],
  ['MGR-ACU-056', 'Split AC', '1 Ton', 'Midea', 'Chicken Cutting Area', 'serviced', 'Serviced 25 Aug 2026', '2026-08-25'],
  ['MPS-ACU-057', 'Split AC', '3 Ton', 'Midea', 'Main Store', 'serviced', 'Serviced 12 Aug 2026', '2026-08-12'],
  ['MPS-ACU-058', 'Split AC', '2 Ton', 'Super General', 'New Office - Downstairs', 'serviced', 'Serviced 12 Aug 2026', '2026-08-12'],
  ['MPS-ACU-059', 'Split AC', '2 Ton', 'Super General', 'Sweet Store & Bakery', 'serviced', 'Serviced 1 Sep 2026', '2026-09-01'],
  ['MPS-ACU-060', 'Split AC', '2.5 Ton', 'Super General', 'Bakery Kitchen', 'serviced', 'Serviced 1 Sep 2026', '2026-09-01'],
  ['MPS-ACU-061', 'Split AC', '1.5 Ton', 'Mitsubishi', 'Sweet Preparing Kitchen', 'serviced', 'Serviced 1 Sep 2026', '2026-09-01'],
  ['MPS-ACU-062', 'Split AC', '2.5 Ton', 'O General', 'Main Kitchen', 'serviced', 'Serviced 1 Sep 2026', '2026-09-01'],
  ['MPS-ACU-063', 'Split AC', '2.5 Ton', 'O General', 'Main Kitchen', 'serviced', 'Serviced 1 Sep 2026', '2026-09-01'],
  ['MPS-ACU-064', 'Split AC', '2.5 Ton', 'Gree', 'Room No. 1', 'serviced', 'Serviced 1 Sep 2026', '2026-09-01'],
  ['MPS-ACU-065', 'Split AC', '2.5 Ton', 'Super General', 'Room No. 2', 'serviced', 'Serviced 1 Sep 2026', '2026-09-01'],
  ['MPS-ACU-066', 'Split AC', '1.5 Ton', 'Hitachi', 'Pizza Oven & Bakery Preparing Area', 'faulty', 'NOT WORKING - Faulty / off', null],
  ['MPS-ACU-067', 'Split AC', '1.5 Ton', 'Midea', 'Shafi Office', 'serviced', 'Serviced - date not specified', null],
  ['MPS-ACU-068', 'Split AC', '1.5 Ton', 'Midea', 'Isham Office', 'due', 'SERVICE DUE', null],
  ['MPS-ACU-069', 'Split AC', '2 Ton', 'Midea', 'Enam Sahib Office', 'due', 'SERVICE DUE', null],
  ['MPS-ACU-070', 'Floor-Standing AC', '3 Ton', 'Super General', 'Main Office', 'due', 'SERVICE DUE', null],
  ['GRS-ACU-071', 'Split AC', '1.5 Ton', 'Gree', 'Terrace', 'due', 'SERVICE DUE', null],
  ['GRS-ACU-072', 'Split AC', '2 Ton', 'Super General', 'Terrace', 'due', 'SERVICE DUE', null],
  ['GRS-ACU-073', 'Split AC', '2.5 Ton', 'Gree', 'Main Counter', 'due', 'SERVICE DUE', null],
  ['GRS-ACU-074', 'Split AC', '2.5 Ton', 'Gree', 'Main Hall', 'serviced', 'Serviced 25 Aug 2026', '2026-08-25'],
  ['GRS-ACU-075', 'Split AC', '2.5 Ton', 'Gree', 'Main Hall', 'serviced', 'Serviced 25 Aug 2026', '2026-08-25'],
  ['GRS-ACU-076', 'Split AC', '2.5 Ton', 'Gree', 'Chaat Counter', 'serviced', 'Serviced approx. 1 Sep 2026', '2026-09-01'],
  ['GRS-ACU-077', 'Split AC', '2.5 Ton', 'O General', 'Main Kitchen', 'due', 'SERVICE DUE', null],
  ['GRS-ACU-078', 'Split AC', '2 Ton', 'Gree', 'Main Kitchen', 'unknown', '25 Aug 2026 - service/install wording to confirm', null],
  ['GRS-ACU-079', 'Split AC', '2.5 Ton', 'Gree', 'Burger Area', 'due', 'SERVICE DUE', null],
  ['GRS-ACU-080', 'Floor-Standing AC', '2.75 Ton', 'Super General', 'Main Hall', 'serviced', 'Serviced 8 Sep 2026', '2026-09-08'],
  ['GRS-ACU-081', 'Floor-Standing AC', '3 Ton', 'Super General', 'Main Hall', 'serviced', 'Serviced 8 Sep 2026', '2026-09-08'],
  ['GRS-ACU-082', 'Floor-Standing AC', '3 Ton', 'General (as dictated)', 'Family Hall', 'due', 'SERVICE DUE', null],
  ['ZG-ACU-083', 'Split AC', '2.5 Ton', 'O General', 'BBQ Room', 'unknown', 'Service date/status not stated', null],
  ['ZG-ACU-084', 'Split AC', '1.5 Ton', 'Midea', 'Pizza Room', 'due', 'SERVICE DUE', null],
  ['ZG-ACU-085', 'Split AC', '2 Ton', 'Gree', 'Main Store / Danish Room', 'serviced', 'Serviced 14 Sep 2026', '2026-09-14'],
  ['ZG-ACU-086', 'Split AC', '2 Ton', 'Gree', 'Chicken Cutting Room', 'serviced', 'Serviced 14 Sep 2026', '2026-09-14'],
  ['ZG-ACU-087', 'Split AC', '2.5 Ton', 'O General', 'Main Kitchen', 'serviced', 'Serviced 14 Sep 2026', '2026-09-14'],
  ['ZG-ACU-088', 'Split AC', '2.5 Ton', 'O General', 'Main Kitchen', 'due', 'SERVICE DUE', null],
  ['ZG-ACU-089', 'Split AC', '2.5 Ton', 'Midea', 'Vegetable Room', 'due', 'SERVICE DUE', null],
  ['ZG-ACU-090', 'Split AC', '2 Ton', 'Gree', 'Room 0', 'unknown', 'Service status not stated', null],
  ['ZG-ACU-091', 'Split AC', '2 Ton', 'Midea', 'Room 0', 'unknown', 'Service status not stated', null],
  ['NHB-CHL-001', 'Refrigerator', null, null, 'Fruit Chaat Area', 'inventory', 'Inventory', null],
  ['NHB-CHL-002', 'Refrigerator', null, null, 'Fruit Chaat Area', 'inventory', 'Inventory', null],
  ['NHB-CHL-003', 'Refrigerator', null, null, 'Kitchen - all sections incl. BBQ & Pizza', 'inventory', 'Inventory', null],
  ['NHB-CHL-004', 'Refrigerator', null, null, 'Kitchen - all sections incl. BBQ & Pizza', 'inventory', 'Inventory', null],
  ['NHB-CHL-005', 'Refrigerator', null, null, 'Kitchen - all sections incl. BBQ & Pizza', 'inventory', 'Inventory', null],
  ['NHB-CHL-006', 'Refrigerator', null, null, 'Kitchen - all sections incl. BBQ & Pizza', 'inventory', 'Inventory', null],
  ['NHB-CHL-007', 'Refrigerator', null, null, 'Kitchen - all sections incl. BBQ & Pizza', 'inventory', 'Inventory', null],
  ['NHB-CHL-008', 'Refrigerator', null, null, 'Kitchen - all sections incl. BBQ & Pizza', 'inventory', 'Inventory', null],
  ['NHB-CHL-009', 'Refrigerator', null, null, 'Kitchen - all sections incl. BBQ & Pizza', 'inventory', 'Inventory', null],
  ['NHB-CHL-010', 'Kulfi Freezer', null, null, 'Hall - near counter', 'inventory', 'Inventory', null],
  ['NHB-CHL-011', 'Cake Display', null, null, 'Hall Counter', 'inventory', 'Inventory', null],
  ['RG-CHL-012', 'Sweets Refrigerator', null, null, 'Sweets Area', 'inventory', 'Inventory', null],
  ['RG-CHL-013', 'Sweets Refrigerator', null, null, 'Sweets Area', 'inventory', 'Inventory', null],
  ['RG-CHL-014', 'Sweets Refrigerator', null, null, 'Sweets Area', 'inventory', 'Inventory', null],
  ['RG-CHL-015', 'Sweets Refrigerator', null, null, 'Sweets Area', 'inventory', 'Inventory', null],
  ['RG-CHL-016', 'Cake / Pastry / Bakery Refrigerator', null, null, 'Bakery / Sweets', 'inventory', 'Inventory', null],
  ['RG-CHL-017', 'Fruit Chaat Refrigerator', null, null, 'Fruit Chaat Area', 'inventory', 'Inventory', null],
  ['RG-CHL-018', 'Additional Refrigerator', null, null, 'Sweets Bar', 'inventory', 'Inventory', null],
  ['RG-CHL-019', 'Small Freezer', null, null, 'Bakery / Sweets / Juice Area', 'inventory', 'Inventory', null],
  ['RG-CHL-020', 'Refrigerator', null, null, 'Live Kitchen', 'inventory', 'Inventory', null],
  ['RG-CHL-021', 'Walk-In Chiller', null, null, 'Kitchen', 'inventory', 'Corrected / Final', null],
  ['RG-CHL-022', 'Refrigerator', null, null, 'Pantry Area', 'inventory', 'Inventory', null],
  ['RG-CHL-023', 'Refrigerator', null, null, 'BBQ Section', 'inventory', 'Inventory', null],
  ['RG-CHL-024', 'Refrigerator', null, null, 'BBQ Section', 'inventory', 'Inventory', null],
  ['RG-CHL-025', 'Freezer', null, null, 'Tandoor Area', 'inventory', 'Inventory', null],
  ['RG-CHL-026', 'Freezer', null, null, 'Tandoor Area', 'inventory', 'Inventory', null],
  ['RG-CHL-027', 'Freezer', null, null, 'Tandoor Area', 'inventory', 'Inventory', null],
  ['RG-CHL-028', 'Refrigerator', null, null, 'Chinese Store', 'inventory', 'Inventory', null],
  ['RG-CHL-029', 'Refrigerator', null, null, 'Main Kitchen', 'inventory', 'Inventory', null],
  ['RG-CHL-030', 'Refrigerator', null, null, 'Main Kitchen', 'inventory', 'Inventory', null],
  ['RG-CHL-031', 'Refrigerator', null, null, 'Main Kitchen', 'inventory', 'Inventory', null],
  ['RG-CHL-032', 'Refrigerator', null, null, 'Main Kitchen', 'inventory', 'Inventory', null],
  ['DGR-CHL-033', 'Refrigerator', null, null, 'Kitchen - mixed sections incl. BBQ', 'inventory', 'Inventory', null],
  ['DGR-CHL-034', 'Refrigerator', null, null, 'Kitchen - mixed sections incl. BBQ', 'inventory', 'Inventory', null],
  ['DGR-CHL-035', 'Refrigerator', null, null, 'Kitchen - mixed sections incl. BBQ', 'inventory', 'Inventory', null],
  ['DGR-CHL-036', 'Refrigerator', null, null, 'Kitchen - mixed sections incl. BBQ', 'inventory', 'Inventory', null],
  ['DGR-CHL-037', 'Refrigerator', null, null, 'Kitchen - mixed sections incl. BBQ', 'inventory', 'Inventory', null],
  ['DGR-CHL-038', 'Dry Freezer', null, null, 'Kitchen', 'inventory', 'Inventory', null],
  ['DGR-CHL-039', 'Fruit Chaat Refrigerator', null, null, 'Main Hall', 'inventory', 'Inventory', null],
  ['DGR-CHL-040', 'Sweets Refrigerator', null, null, 'Main Hall', 'inventory', 'Inventory', null],
  ['DGR-CHL-041', 'Sweets Refrigerator', null, null, 'Main Hall', 'inventory', 'Inventory', null],
  ['DGR-CHL-042', 'Cake & Pastry Refrigerator', null, null, 'Main Hall', 'inventory', 'Inventory', null],
  ['DGR-CHL-043', 'Kulfi Freezer', null, null, 'Main Hall', 'inventory', 'Inventory', null],
  ['DGR-CHL-044', 'Other / Normal Freezer', null, null, 'Main Hall', 'inventory', 'Inventory', null],
  ['DGR-CHL-045', 'Other / Normal Freezer', null, null, 'Main Hall', 'inventory', 'Inventory', null],
  ['GRSB-CHL-046', 'Refrigerator', null, null, 'Kitchen', 'inventory', 'Final', null],
  ['GRSB-CHL-047', 'Freezer', null, null, 'Hall', 'inventory', 'Final', null],
  ['GRSB-CHL-048', 'Refrigerator', null, null, 'Hall - Chaat Area', 'inventory', 'Final', null],
  ['GRSB-CHL-049', 'Sweet Display', null, null, 'Hall', 'inventory', 'Final', null],
  ['GRSB-CHL-050', 'Kulfi Salaja / Freezer', null, null, 'Hall', 'inventory', 'Final', null],
  ['GRSB-CHL-051', 'Cake / Pastry Display Chiller', null, 'Marriott', 'Hall', 'inventory', 'Final', null],
  ['NH-CHL-052', 'Refrigerator', null, null, 'Branch Inventory', 'inventory', 'Inventory', null],
  ['NH-CHL-053', 'Refrigerator', null, null, 'Branch Inventory', 'inventory', 'Inventory', null],
  ['NH-CHL-054', 'Refrigerator', null, null, 'Branch Inventory', 'inventory', 'Inventory', null],
  ['NH-CHL-055', 'Refrigerator', null, null, 'Branch Inventory', 'inventory', 'Inventory', null],
  ['NH-CHL-056', 'Small Freezer', null, null, 'Branch Inventory', 'inventory', 'Inventory', null],
  ['NH-CHL-057', 'Freezer', null, null, 'Second Kitchen', 'inventory', 'Inventory', null],
  ['NH-CHL-058', 'Deep Freezer', null, null, 'Second Kitchen', 'inventory', 'Inventory', null],
  ['NH-CHL-059', 'Chaat Freezer', null, null, 'Second Kitchen', 'inventory', 'Inventory', null],
  ['NH-CHL-060', 'Pastry Deep Freezer', null, null, 'Hall / Outside', 'inventory', 'Inventory', null],
  ['NH-CHL-061', 'Kulfi Freezer', null, null, 'Hall / Outside', 'inventory', 'Inventory', null],
  ['MGR-CHL-062', 'Sweet Refrigerator / Freezer Unit', null, null, 'Sweet Section', 'inventory', 'Mixed refrigerator/freezer unit', null],
  ['MGR-CHL-063', 'Sweet Refrigerator / Freezer Unit', null, null, 'Sweet Section', 'inventory', 'Mixed refrigerator/freezer unit', null],
  ['MGR-CHL-064', 'Sweet Refrigerator / Freezer Unit', null, null, 'Sweet Section', 'inventory', 'Mixed refrigerator/freezer unit', null],
  ['MGR-CHL-065', 'Kulfi Freezer', null, null, 'Kulfi Storage', 'inventory', 'Inventory', null],
  ['MGR-CHL-066', 'Fruit Chaat Refrigerator', null, null, 'Fruit Chaat Area', 'inventory', 'Inventory', null],
  ['MGR-CHL-067', 'Refrigerator', null, null, 'Main Kitchen', 'inventory', 'Inventory', null],
  ['MGR-CHL-068', 'Refrigerator', null, null, 'Main Kitchen', 'inventory', 'Inventory', null],
  ['MGR-CHL-069', 'Refrigerator', null, null, 'Vegetable Kitchen', 'inventory', 'Inventory', null],
  ['MGR-CHL-070', 'Refrigerator', null, null, 'Vegetable Kitchen', 'inventory', 'Inventory', null],
  ['MGR-CHL-071', 'Freezer', null, null, 'Vegetable Kitchen', 'inventory', 'Inventory', null],
  ['MGR-CHL-072', 'Refrigerator', null, null, 'Pizza Section', 'inventory', 'Added / Inventory', null],
  ['MGR-CHL-073', 'Refrigerator', null, null, 'Pizza Section', 'inventory', 'Added / Inventory', null],
  ['MGR-CHL-074', 'Refrigerator', null, null, 'Pizza Section', 'inventory', 'Added / Inventory', null],
  ['MGR-CHL-075', 'Refrigerator', null, null, 'Pizza Section', 'inventory', 'Added / Inventory', null],
  ['MGR-CHL-076', 'Freezer', null, null, 'Pizza Section', 'inventory', 'Added / Inventory', null],
  ['MPS-CHL-077', 'Room Chiller', null, null, 'Main Store - inside alley', 'serviced', 'Outdoor cleaned 1 Sep 2026', '2026-09-01'],
  ['MPS-CHL-078', 'Room Chiller', null, null, 'Main Store', 'serviced', 'Outdoor cleaned 1 Sep 2026', '2026-09-01'],
  ['GRS-CHL-079', 'Refrigerator', null, null, 'Pizza & Burger Area', 'inventory', 'Inventory', null],
  ['GRS-CHL-080', 'Refrigerator', null, null, 'Pizza & Burger Area', 'inventory', 'Inventory', null],
  ['GRS-CHL-081', 'Freezer', null, null, 'Pizza & Burger Area', 'inventory', 'Inventory', null],
  ['GRS-CHL-082', 'Karahi / Prepared Food Refrigerator', null, null, 'Front Main Kitchen', 'inventory', 'Inventory', null],
  ['GRS-CHL-083', 'Sweets Refrigerator', null, null, 'Chaat Counter', 'inventory', 'Inventory', null],
  ['GRS-CHL-084', 'Sweets Refrigerator', null, null, 'Chaat Counter', 'inventory', 'Inventory', null],
  ['GRS-CHL-085', 'Kulfi Freezer', null, null, 'Chaat Counter', 'inventory', 'Inventory', null],
  ['GRS-CHL-086', 'Fruit Chaat Refrigerator', null, null, 'Chaat Counter', 'inventory', 'Inventory', null],
  ['GRS-CHL-087', 'Cake & Pastry Refrigerator', null, null, 'Chaat Counter', 'inventory', 'Inventory', null],
  ['GRS-CHL-088', 'Additional Sweets / Storage Refrigerator', null, null, 'Chaat Counter', 'inventory', 'Inventory', null],
  ['ZG-CHL-089', 'Large Walk-In / Room Refrigerator', null, null, 'Main Zaharat Gujarat', 'inventory', 'Inventory', null],
  ['ZG-CHL-090', 'Large Walk-In / Room Refrigerator', null, null, 'Main Zaharat Gujarat', 'inventory', 'Inventory', null],
  ['ZG-CHL-091', 'Large Freezer', null, null, 'Main Zaharat Gujarat', 'inventory', 'Inventory', null],
  ['ZG-CHL-092', 'Refrigerator', null, null, 'BBQ Room', 'inventory', 'Inventory', null],
  ['ZG-CHL-093', 'Refrigerator', null, null, 'BBQ Room', 'inventory', 'Inventory', null],
  ['NHB-ELC-001', 'Fryer', null, null, 'Kitchen', 'inventory', 'Inventory', null],
  ['NHB-ELC-002', 'Oven', null, null, 'Kitchen', 'inventory', 'Inventory', null],
  ['NHB-ELC-003', 'Blender', null, null, 'Small Kitchen beside Hall', 'inventory', 'Inventory', null],
  ['NHB-ELC-004', 'Drinking Water Cooler / Filter', null, 'Milano', 'Small Kitchen beside Hall', 'inventory', 'Inventory', null],
  ['NHB-ELC-005', 'High-Performance Blender', null, null, 'Hall', 'inventory', 'Inventory', null],
  ['NHB-ELC-006', 'Automatic Dome / Lid Sealing Machine', null, null, 'Hall', 'inventory', 'Inventory', null],
  ['RG-ELC-007', 'Shake Machine', null, null, 'Juice / Sweets Area', 'inventory', 'Unit 1 of 2', null],
  ['RG-ELC-008', 'Shake Machine', null, null, 'Juice / Sweets Area', 'inventory', 'Unit 2 of 2', null],
  ['RG-ELC-009', 'Dome / Lid Sealing Machine', null, null, 'Juice / Sweets Area', 'inventory', 'Inventory', null],
  ['RG-ELC-010', 'Coffee Machine', null, null, 'Bakery / Sweets Area', 'inventory', 'Inventory', null],
  ['RG-ELC-011', 'Ice Maker', null, null, 'Bakery / Sweets Area', 'inventory', 'Inventory', null],
  ['RG-ELC-012', 'Coffee Blender', null, null, 'Bakery / Sweets Area', 'inventory', 'Inventory', null],
  ['RG-ELC-013', 'Hot Plate', null, null, 'Bakery / Sweets Area', 'inventory', 'Inventory', null],
  ['RG-ELC-014', 'Juice Machine', null, null, 'Bakery / Sweets Area', 'inventory', 'Inventory', null],
  ['RG-ELC-015', 'Hot Holding / Display Machine', null, null, 'Bakery / Sweets Area', 'inventory', 'Jalebi / Samosa', null],
  ['RG-ELC-016', 'Weighing Scale Machine', null, null, 'Bakery / Sweets Area', 'inventory', 'Unit 1 of 2', null],
  ['RG-ELC-017', 'Weighing Scale Machine', null, null, 'Bakery / Sweets Area', 'inventory', 'Unit 2 of 2', null],
  ['RG-ELC-018', 'Small Oven', null, null, 'Bakery / Sweets Area', 'inventory', 'Warming sweets / small items', null],
  ['RG-ELC-019', 'TV / Menu Display Machine', null, null, 'Live Kitchen', 'inventory', 'Live menu display', null],
  ['RG-ELC-020', 'Drinking Water Cooler', null, null, 'Pantry Area', 'inventory', 'Inventory', null],
  ['RG-ELC-021', 'Hot Holding Machine / Unit', null, null, 'Tandoor Area', 'inventory', 'Inventory', null],
  ['RG-ELC-022', 'Dough / Flour Mixing Machine', null, null, 'Vegetable Store', 'inventory', 'Inventory', null],
  ['RG-ELC-023', 'Pizza Oven', null, null, 'Main Kitchen', 'inventory', 'Inventory', null],
  ['RG-ELC-024', 'Small Oven', null, null, 'Main Kitchen', 'inventory', 'Inventory', null],
  ['RG-ELC-025', 'Hot-Light / Food Warmer', null, null, 'Main Kitchen', 'inventory', 'Inventory', null],
  ['RG-ELC-026', 'Juice Blender', null, null, 'Main Kitchen', 'inventory', 'Tomatoes etc.', null],
  ['RG-ELC-027', 'Spice Blender / Grinder', null, null, 'Kitchen', 'inventory', 'Inventory', null],
  ['RG-ELC-028', 'Water Cooler', null, 'Milano', 'Main Counter', 'inventory', 'OK', null],
  ['RG-ELC-029', 'Fan', null, null, 'Outdoor Area', 'inventory', 'Inventory', null],
  ['RG-ELC-030', 'Fan', null, null, 'Outdoor Area', 'inventory', 'Inventory', null],
  ['RG-ELC-031', 'Fan', null, null, 'Outdoor Area', 'inventory', 'Inventory', null],
  ['RG-ELC-032', 'Fan', null, null, 'Outdoor Area', 'inventory', 'Inventory', null],
  ['RG-ELC-033', 'Fan', null, null, 'Outdoor Area', 'inventory', 'Inventory', null],
  ['RG-ELC-034', 'Fan', null, null, 'Outdoor Area', 'inventory', 'Inventory', null],
  ['RG-ELC-035', 'Fan', null, null, 'Dish Wash + Small/Main Tandoor Kitchen', 'inventory', 'Inventory', null],
  ['RG-ELC-036', 'Fan', null, null, 'Dish Wash + Small/Main Tandoor Kitchen', 'inventory', 'Inventory', null],
  ['RG-ELC-037', 'Fan', null, null, 'Dish Wash + Small/Main Tandoor Kitchen', 'inventory', 'Inventory', null],
  ['RG-ELC-038', 'Fan', null, null, 'Dish Wash + Small/Main Tandoor Kitchen', 'inventory', 'Inventory', null],
  ['DGR-ELC-039', 'Cooling Drinking-Water Filter / Cooler', null, null, 'Kitchen', 'inventory', 'Inventory', null],
  ['DGR-ELC-040', 'Dough / Flour Machine', null, null, 'Kitchen', 'inventory', 'Inventory', null],
  ['DGR-ELC-041', 'Juice Machine', null, null, 'Kitchen', 'inventory', 'Inventory', null],
  ['DGR-ELC-042', 'Oven', null, null, 'Kitchen', 'inventory', 'Inventory', null],
  ['DGR-ELC-043', 'Large Pizza Oven', null, null, 'Kitchen', 'inventory', 'Inventory', null],
  ['DGR-ELC-044', 'Bain-Marie', null, null, 'Kitchen', 'inventory', 'Inventory', null],
  ['DGR-ELC-045', 'Spice Blender', null, null, 'Kitchen', 'inventory', 'Inventory', null],
  ['DGR-ELC-046', 'Fryer', null, null, 'Kitchen', 'inventory', 'Inventory', null],
  ['DGR-ELC-047', 'Shake Machine', null, null, 'Kitchen', 'inventory', 'Inventory', null],
  ['DGR-ELC-048', 'Electric Tea Kettle', null, null, 'Main Hall', 'inventory', 'Inventory', null],
  ['DGR-ELC-049', 'Shake Machine', null, null, 'Main Hall', 'inventory', 'Inventory', null],
  ['DGR-ELC-050', 'Hot Case / Display Warmer', null, null, 'Main Hall', 'inventory', 'Samosa & Jalebi', null],
  ['GRSB-ELC-051', 'High-Performance Blender', null, null, 'Hall', 'inventory', 'Inventory', null],
  ['GRSB-ELC-052', 'Automatic Dome-Lid Closing Machine', null, null, 'Hall', 'inventory', 'Inventory', null],
  ['GRSB-ELC-053', 'Drinking Water Filter / Cooler', null, 'Milano', 'Hall', 'inventory', 'Staff drinking water', null],
  ['GRSB-ELC-054', 'Oven', null, null, 'Kitchen', 'inventory', 'Inventory', null],
  ['GRSB-ELC-055', 'Fryer', null, null, 'Kitchen', 'inventory', 'Inventory', null],
  ['NH-ELC-056', 'Fryer', null, null, 'Kitchen / Branch', 'inventory', 'Inventory', null],
  ['NH-ELC-057', 'Dough / Flour Mixing Machine', null, null, 'Kitchen / Branch', 'inventory', 'Inventory', null],
  ['NH-ELC-058', 'Large Pizza Oven', null, null, 'Kitchen / Branch', 'inventory', 'Inventory', null],
  ['NH-ELC-059', 'Water Cooler', null, 'Milano', 'Kitchen / Branch', 'inventory', 'Inventory', null],
  ['NH-ELC-060', 'Burger / Grill Machine', null, null, 'Kitchen / Branch', 'inventory', 'For burgers / grilling', null],
  ['NH-ELC-061', 'Microwave Oven', null, null, 'Second Kitchen', 'inventory', 'Inventory', null],
  ['NH-ELC-062', 'Juice Sealing Machine', null, null, 'Second Kitchen', 'inventory', 'Inventory', null],
  ['NH-ELC-063', 'Juicer Machine', null, null, 'Second Kitchen', 'inventory', 'Inventory', null],
  ['NH-ELC-064', 'Bain-Marie', null, null, 'Second Kitchen', 'inventory', 'Inventory', null],
  ['MGR-ELC-065', 'Oven', null, null, 'Hall / Listed Equipment', 'inventory', 'Inventory', null],
  ['MGR-ELC-066', 'Juice Glass Dome / Sealing Machine', null, null, 'Juice Area', 'inventory', 'Inventory', null],
  ['MGR-ELC-067', 'Shake Machine', null, null, 'Kitchen / Main Hall', 'inventory', 'Fresh lassi / shakes', null],
  ['MGR-ELC-068', 'Juice Machine', null, null, 'Juice Preparation', 'inventory', 'Inventory', null],
  ['MGR-ELC-069', 'Fryer', null, null, 'Main Kitchen', 'inventory', 'Inventory', null],
  ['MGR-ELC-070', 'Bain-Marie - Salan / Curry', null, null, 'Main Kitchen', 'inventory', 'Inventory', null],
  ['MGR-ELC-071', 'Bain-Marie - Rice', null, null, 'Main Kitchen', 'inventory', 'Inventory', null],
  ['MGR-ELC-072', 'Oven', null, null, 'Main Kitchen', 'inventory', 'Inventory', null],
  ['MGR-ELC-073', 'Keema / Mincer Machine', null, null, 'Vegetable Kitchen', 'inventory', 'Inventory', null],
  ['MGR-ELC-074', 'Masala Grinder', null, null, 'Vegetable Kitchen', 'inventory', 'Inventory', null],
  ['MPS-ELC-075', 'Ice Maker', null, null, 'Main Kitchen', 'inventory', 'Inventory', null],
  ['MPS-ELC-076', 'Raita Mixer Machine', null, null, 'Main Kitchen', 'inventory', 'Inventory', null],
  ['MPS-ELC-077', 'Knife Sharpening Machine', null, null, 'Main Kitchen', 'inventory', 'Inventory', null],
  ['MPS-ELC-078', 'Shake Machine', null, null, 'Main Kitchen', 'inventory', 'Unit 1 of 2', null],
  ['MPS-ELC-079', 'Shake Machine', null, null, 'Main Kitchen', 'inventory', 'Unit 2 of 2', null],
  ['MPS-ELC-080', 'Rasmalai / Gulab Jamun Making Machine', null, null, 'Main Kitchen', 'inventory', 'Inventory', null],
  ['MPS-ELC-081', 'Grinder Machine (Spices)', null, null, 'Main Kitchen', 'inventory', 'Inventory', null],
  ['MPS-ELC-082', 'Atta / Dough Machine', null, null, 'Main Kitchen', 'inventory', 'Inventory', null],
  ['MPS-ELC-083', 'Potato Machine', null, null, 'Main Kitchen', 'inventory', 'Inventory', null],
  ['MPS-ELC-084', 'Keema / Meat Mincer Machine', null, null, 'Main Kitchen', 'inventory', 'Inventory', null],
  ['MPS-ELC-085', 'Salad Machine', null, null, 'Main Kitchen', 'inventory', 'Inventory', null],
  ['MPS-ELC-086', 'Fan', null, null, 'Main Kitchen', 'inventory', 'Inventory', null],
  ['MPS-ELC-087', 'Large Oven', null, null, 'Bakery Area', 'inventory', 'Inventory', null],
  ['MPS-ELC-088', 'Brewer Machine', null, null, 'Bakery Area', 'inventory', 'Recorded name', null],
  ['MPS-ELC-089', 'Small Oven', null, null, 'Bakery Area', 'inventory', 'Inventory', null],
  ['MPS-ELC-090', 'Flour / Dough Mixer Machine', null, null, 'Bakery Area', 'inventory', 'Inventory', null],
  ['MPS-ELC-091', 'Plastic Packet Sealing Machine', null, null, 'Bakery Area', 'inventory', 'Inventory', null],
  ['MPS-ELC-092', 'Dating / Date Coding Machine', null, null, 'New Small Office', 'inventory', 'Inventory', null],
  ['MPS-ELC-093', 'Printer Machine', null, null, 'New Small Office', 'inventory', 'Inventory', null],
  ['GRS-ELC-094', 'Shake Machine', null, null, 'Pizza & Burger Area', 'inventory', 'Inventory', null],
  ['GRS-ELC-095', 'Glass Packing Machine', null, null, 'Pizza & Burger Area', 'inventory', 'Inventory', null],
  ['GRS-ELC-096', 'Pizza Oven', null, null, 'Pizza & Burger Area', 'inventory', 'Inventory', null],
  ['GRS-ELC-097', 'Fryer', null, null, 'Pizza & Burger Area', 'inventory', 'Inventory', null],
  ['GRS-ELC-098', 'Bain-Marie', null, null, 'Front Main Kitchen', 'inventory', 'Unit 1 of 2', null],
  ['GRS-ELC-099', 'Bain-Marie', null, null, 'Front Main Kitchen', 'inventory', 'Unit 2 of 2', null],
  ['GRS-ELC-100', 'Small Oven', null, null, 'Front Main Kitchen', 'inventory', 'Inventory', null],
  ['GRS-ELC-101', 'Drinking Water Cooler', null, null, 'Front Main Kitchen', 'inventory', 'Inventory', null],
  ['GRS-ELC-102', 'Weighing Machine', null, null, 'Chaat Counter', 'inventory', 'Inventory', null],
  ['GRS-ELC-103', 'Sugarcane Machine', null, null, 'Chaat Counter', 'inventory', 'Inventory', null],
  ['GRS-ELC-104', 'Tea Kettle', null, null, 'Chaat Counter', 'inventory', 'Unit 1 of 2', null],
  ['GRS-ELC-105', 'Tea Kettle', null, null, 'Chaat Counter', 'inventory', 'Unit 2 of 2', null],
  ['GRS-ELC-106', 'Ice Maker Machine', null, null, 'Chaat Counter', 'inventory', 'Inventory', null],
  ['ZG-ELC-107', 'Drinking Water Cooler', null, null, 'BBQ Room', 'inventory', 'Inventory', null],
  ['ZG-ELC-108', 'Fryer', null, null, 'BBQ Room', 'inventory', 'Inventory', null],
  ['ZG-ELC-109', 'Bain-Marie', null, null, 'BBQ Room', 'inventory', 'Inventory', null],
  ['ZG-ELC-110', 'Sauce Machine', null, null, 'Pizza Room', 'inventory', 'Inventory', null],
  ['ZG-ELC-111', 'Juicer Machine', null, null, 'Pizza Room', 'inventory', 'Inventory', null],
  ['ZG-ELC-112', 'Masala / Spice Packing Machine', null, null, 'Main Store / Danish Room', 'inventory', 'Inventory', null],
  ['ZG-ELC-113', 'Keema / Meat Mincer Machine', null, null, 'Chicken Cutting Room', 'inventory', 'Inventory', null],
  ['ZG-ELC-114', 'Masala Blender', null, null, 'Chicken Cutting Room', 'inventory', 'Inventory', null],
  ['ZG-ELC-115', 'Atta / Dough Machine', null, null, 'Main Kitchen', 'inventory', 'Inventory', null],
  ['ZG-ELC-116', 'Keema / Meat Mincer Machine', null, null, 'Main Kitchen', 'inventory', 'Inventory', null],
  ['ZG-ELC-117', 'Juice Machine', null, null, 'Main Kitchen', 'inventory', 'Inventory', null],
  ['ZG-ELC-118', 'Salad Machine', null, null, 'Main Kitchen', 'inventory', 'Inventory', null],
]

/** Which branch an asset number belongs to, by its prefix. */
export const BRANCH_BY_PREFIX: Record<string, string> = {
  'NHB': 'Nana House - Shabiya 11',
  'RG': 'Royal Gujarat',
  'DGR': 'Mussafah 17 - Delight Gujarat',
  'GRSB': 'Shabiya 12 - Gujarat Restaurants',
  'NH': 'Nana House - Shabiya 10',
  'MGR': 'Mafraq Gujarat Restaurant',
  'MPS': 'Manpasand - New Store',
  'GRS': 'Mussafah 26 - Gujarat Hotel',
  'ZG': 'Mussafah 26 - Zaharat Gujarat',
};

/**
 * Which trade each asset-number segment belongs to.
 *
 * The three the estate numbers today. A category with no segment here — gas,
 * fire safety — simply has no numbered assets yet; `assetSegmentFor` falls
 * back to a segment derived from the category id, so adding a fire
 * extinguisher produces `RG-FIR-001` rather than refusing to number it.
 */
export const SEGMENT_CATEGORY: Record<string, MaintenanceCategory> = {
  ACU: 'AC_VENTILATION',
  CHL: 'REFRIGERATION',
  ELC: 'ELECTRICAL',
};

export interface RegisterAsset {
  assetNo: string;
  branchName: string;
  category: MaintenanceCategory;
  /** The segment of its asset number: ACU, CHL or ELC. */
  segment: string;
  /** What the unit is, on the register's own wording. Also its name. */
  assetType: string;
  /** Cooling capacity, AC units only — "2.5 Ton". */
  capacity: string | null;
  make: string | null;
  location: string | null;
  status: ServiceStatus;
  /** The register's wording, verbatim. */
  statusNote: string | null;
  lastServicedOn: string | null;
}

export const ASSET_REGISTER: RegisterAsset[] = ROWS.map(
  ([assetNo, assetType, capacity, make, location, status, statusNote, lastServicedOn]) => {
    const [prefix, segment] = assetNo.split('-');
    return {
      assetNo,
      branchName: BRANCH_BY_PREFIX[prefix],
      category: SEGMENT_CATEGORY[segment] ?? 'OTHER',
      segment,
      assetType,
      capacity,
      make,
      location,
      status,
      statusNote,
      lastServicedOn,
    };
  }
);
