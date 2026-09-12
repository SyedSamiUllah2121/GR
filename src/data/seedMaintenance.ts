import { MaintenanceJob } from '../types';
import { SEED_EQUIPMENT } from './seedEquipment';
import { SEED_PLANS } from './seedPlans';

/**
 * Demo maintenance jobs, so the module has something to show on first run.
 * Deliberately spread across the three states — reported, in progress and
 * completed — and across two months, so the month-end report has data on
 * either side of a boundary.
 */

/** ISO timestamp for a plain date and 24-hour time, in the reader's own zone. */
function at(date: string, hour: number, minute: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

/** The hand-written demo jobs: breakdowns, spread across the three states. */
const REPORTED_JOBS: MaintenanceJob[] = [
  {
    id: 'mnt-seed-1',
    branchName: "Zahra's Kitchen",
    title: 'Dining area AC not cooling',
    details:
      'Split AC over the dining counter runs but blows warm air. Room temperature climbing through service. Filters were cleaned last month.',
    equipment: 'Split AC 2 — dining area',
    category: 'AC_VENTILATION',
    priority: 'high',
    reportedBy: 'A. Rahman',
    reportedAt: at('2026-08-24', 16, 40),
    startedAt: at('2026-08-26', 9, 15),
    completedAt: at('2026-08-26', 12, 5),
    attendedBy: 'Cool Air Services',
    resolutionNote:
      'Gas recharged and a leaking joint on the outdoor unit resealed. Cooling checked at 18°C on return air.',
    cost: 450,
    photo: null,
  },
  {
    id: 'mnt-seed-2',
    branchName: 'Mafraq Gujrat Restaurant',
    title: 'Hand wash tap not running',
    details:
      'Kitchen hand wash basin tap gives no water. Staff are using the prep sink instead, which is not acceptable for hand washing.',
    equipment: 'Hand wash basin — kitchen entrance',
    category: 'PLUMBING',
    priority: 'critical',
    reportedBy: 'M. Farooq',
    reportedAt: at('2026-08-17', 14, 20),
    startedAt: at('2026-08-18', 8, 0),
    completedAt: at('2026-08-18', 9, 30),
    attendedBy: 'In-house maintenance',
    resolutionNote: 'Blocked aerator cleared and washer replaced. Flow restored and tested.',
    cost: 60,
    photo: null,
    sourceInspectionId: 'insp-seed-4',
  },
  {
    id: 'mnt-seed-3',
    branchName: 'Mafraq Gujrat Restaurant',
    title: 'Walk-in chiller holding above 5°C',
    details:
      'Chiller reading 8°C first thing in the morning and not pulling down. Stock moved to the second chiller as a precaution.',
    equipment: 'Walk-in chiller — dry store side',
    category: 'REFRIGERATION',
    priority: 'critical',
    reportedBy: 'M. Farooq',
    reportedAt: at('2026-09-02', 7, 45),
    startedAt: at('2026-09-02', 15, 30),
    completedAt: null,
    attendedBy: null,
    resolutionNote: null,
    cost: null,
    photo: null,
  },
  {
    id: 'mnt-seed-4',
    branchName: "Zahra's Kitchen",
    title: 'Kitchen wall tiles cracked and lifting',
    details:
      'Outside wall tiles by the pizza kitchen are cracked and coming away. Surface cannot be cleaned properly in that state.',
    equipment: 'Wall tiling — pizza kitchen exterior',
    category: 'STRUCTURAL',
    priority: 'medium',
    reportedBy: 'A. Rahman',
    reportedAt: at('2026-09-01', 10, 10),
    startedAt: null,
    completedAt: null,
    attendedBy: null,
    resolutionNote: null,
    cost: null,
    photo: null,
    sourceInspectionId: 'insp-seed-3',
  },
  {
    id: 'mnt-seed-5',
    branchName: 'Gujrat Restaurant',
    title: 'Extraction hood fan noisy',
    details:
      'Extraction over the range has developed a loud rattle and pulls less than it used to. Kitchen getting smoky at peak.',
    equipment: 'Extraction hood — main range',
    category: 'AC_VENTILATION',
    priority: 'medium',
    reportedBy: 'S. Iqbal',
    reportedAt: at('2026-09-03', 17, 25),
    startedAt: null,
    completedAt: null,
    attendedBy: null,
    resolutionNote: null,
    cost: null,
    photo: null,
  },
  {
    id: 'mnt-seed-6',
    branchName: 'Naan House Metro',
    title: 'Fly killer unit not lighting',
    details: 'Tube in the fly killer by the back door is dead. Unit otherwise intact.',
    equipment: 'Fly killer — rear entrance',
    category: 'PEST_CONTROL',
    priority: 'low',
    reportedBy: 'A. Rahman',
    reportedAt: at('2026-09-04', 11, 0),
    startedAt: at('2026-09-04', 14, 0),
    completedAt: at('2026-09-04', 14, 25),
    attendedBy: 'In-house maintenance',
    resolutionNote: 'Tube and starter replaced from stock.',
    cost: 35,
    photo: null,
  },
  {
    id: 'mnt-seed-7',
    branchName: 'Gujrat Restaurant',
    title: 'Fire extinguisher service overdue',
    details:
      'Service label on the kitchen extinguisher expired last month. Needs the annual service and a new tag.',
    equipment: 'Dry powder extinguisher — kitchen',
    category: 'FIRE_SAFETY',
    priority: 'high',
    reportedBy: 'S. Iqbal',
    reportedAt: at('2026-09-05', 9, 30),
    startedAt: at('2026-09-06', 10, 0),
    completedAt: at('2026-09-06', 10, 45),
    attendedBy: 'Gulf Fire Safety',
    resolutionNote: 'Serviced, pressure tested and re-tagged. Next service due in 12 months.',
    cost: 120,
    photo: null,
  },
];

// ---------------------------------------------------------------------------
// What has already been looked after
// ---------------------------------------------------------------------------

/**
 * One recorded general maintenance per seeded asset, so a fresh installation
 * opens on a register that has been looked after rather than one that has
 * never been touched.
 *
 * This is not decoration. The schedule counts from the last recorded
 * completion, so without it every asset would anchor to its install date in
 * 2025 and the very first load would raise ninety-one overdue services in one
 * go — a board nobody can read, on a feature whose whole point is telling you
 * what actually needs doing.
 *
 * The days are staggered across the summer so the arithmetic lands somewhere
 * interesting: a fortnightly display fridge serviced in early September is
 * comfortably in period, a monthly extinguisher serviced in July is not, and
 * the register shows both states the moment it opens.
 *
 * Fixed dates rather than dates relative to today, because these are rendered
 * on the server and again on the client and a seed computed from the clock can
 * differ across a midnight boundary.
 *
 * Reaches a fresh browser only. The job store has no seed marker — unlike the
 * branches, the plans and the register, it holds work rather than reference
 * data, and merging records into somebody's board is not a thing to do quietly.
 */
const LAST_SERVICED = [
  '2026-06-14',
  '2026-07-02',
  '2026-07-19',
  '2026-08-01',
  '2026-08-13',
  '2026-08-27',
  '2026-09-05',
];

/** Exactly as `generalPlanIdFor` derives it. */
const generalPlanId = (category: string) =>
  `plan-${category.toLowerCase()}-general-maintenance`;

/** Exactly as `scheduledJobIdFor` derives it, so the sweep finds these already done. */
const scheduledJobId = (planId: string, equipmentId: string, dueOn: string) =>
  `mnt-plan-${planId}-${equipmentId}-${dueOn}`;

/**
 * One recorded completion per asset per plan that covers it.
 *
 * Every plan, not only the general one. A record covering general maintenance
 * alone would leave each asset's named services — the annual gas check, the
 * printer service — anchored to a 2025 install date, and the first sweep would
 * still put sixty of them on the board at once.
 *
 * The staggering is what makes the demo read: general maintenance runs on short
 * cadences, so spreading the last service across the summer leaves some assets
 * comfortably in period and some plainly overdue, which is the state the screen
 * exists to show. The named services are mostly annual, so a completion in the
 * same window puts them all quietly in the future, where an annual service
 * carried out this year belongs.
 */
const SERVICE_HISTORY: MaintenanceJob[] = SEED_EQUIPMENT.filter((item) => item.active).flatMap(
  (item, itemIndex) =>
    SEED_PLANS.filter(
      (plan) =>
        plan.active &&
        plan.category === item.category &&
        // An asset on somebody else's contract has no history of ours to show
        item.planOverrides?.[plan.id] !== null
    ).map((plan, planIndex) => {
      const on = LAST_SERVICED[(itemIndex + planIndex) % LAST_SERVICED.length];
      const general = plan.id === generalPlanId(item.category);
      const where = item.location ? ` (${item.location})` : '';

      return {
        id: general
          ? // The id `generalDoneIdFor` builds, so recording the same day
            // twice lands on one record rather than two
            `mnt-general-${item.id}-${on}`
          : scheduledJobId(plan.id, item.id, on),
        branchName: item.branchName,
        title: `${plan.task} — ${item.name}`,
        details: `${plan.task} carried out on ${on}. Unit: ${item.name}${where}.`,
        equipment: item.name,
        category: item.category,
        priority: plan.priority,
        reportedBy: general ? 'Recorded on the register' : 'Maintenance schedule',
        reportedAt: at(on, 9, 0),
        startedAt: at(on, 9, 0),
        completedAt: at(on, 11, 30),
        attendedBy: itemIndex % 3 === 0 ? 'In-house maintenance' : 'Gujrat Facility Services',
        resolutionNote: 'Cleaned, checked and tested. Nothing found needing a repair.',
        cost: null,
        photo: null,
        kind: 'scheduled',
        equipmentId: item.id,
        planId: plan.id,
        dueOn: on,
      } as MaintenanceJob;
    })
);

export const SEED_MAINTENANCE: MaintenanceJob[] = [...REPORTED_JOBS, ...SERVICE_HISTORY];
