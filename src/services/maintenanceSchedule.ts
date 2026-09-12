import {
  Equipment,
  Interval,
  IntervalUnit,
  MaintenanceJob,
  MaintenancePlan,
  jobKindOf,
} from '../types';
import { getEquipment } from './equipmentStore';
import { activePlans } from './maintenancePlanStore';
import { getJobs, saveJob, statusOf } from './maintenanceStore';

/**
 * Turning plans into jobs.
 *
 * There is no server and no cron here, so nothing happens on a schedule of
 * its own: due work is worked out from the data every time the app loads, and
 * whatever is due becomes a job on the board. That is only safe because the
 * job's id is *derived* from what it is an occurrence of —
 *
 *     mnt-plan-<planId>-<equipmentId>-<dueOn>
 *
 * so the same due date can never raise two jobs. Two tabs open at once both
 * compute the same id and write the same record; the second is a no-op
 * rewrite rather than a duplicate. This is the device `jobIdFor` already uses
 * for inspection findings, which is the existing answer in this codebase to
 * "create this exactly once".
 *
 * Dates here are plain ISO days, `YYYY-MM-DD`, not instants. A service is due
 * on a date, not at a moment, and storing an instant would make a job due on
 * the 10th appear on the 9th for anyone west of the timezone it was computed
 * in.
 */

/** A date as the local calendar reads it, `YYYY-MM-DD`. */
export function toIsoDay(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * An ISO day back as a local date at midnight, or null if it is not a real day.
 *
 * The rollover check is the point of this. `new Date(2026, 1, 29)` does not
 * fail on a 29 February that never existed — it quietly returns 1 March, and
 * an asset imported with that typo would then be serviced on a schedule
 * anchored to a date nobody wrote. A date that is not a date is refused here
 * so the import can report it, rather than silently shifting the work.
 */
export function fromIsoDay(day: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day.slice(0, 10));
  if (!m) return null;

  const year = Number(m[1]);
  const month = Number(m[2]);
  const date = Number(m[3]);
  const d = new Date(year, month - 1, date);
  if (Number.isNaN(d.getTime())) return null;

  // Rolled over, so the day it names does not exist in that month
  if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== date) {
    return null;
  }
  return d;
}

/** Whether a string names a real calendar day. */
export function isRealIsoDay(day: string): boolean {
  return fromIsoDay(day) !== null;
}

/**
 * Adds whole months to a date, keeping the day of the month where it exists.
 *
 * `setMonth` alone overflows: 31 January plus one month is 3 March, because
 * February has no 31st. A service due on the 31st should fall on the last day
 * of a short month, not skid into the next one — otherwise a monthly plan
 * anchored on the 31st drifts a day later every February.
 */
export function addMonths(day: string, months: number): string | null {
  const date = fromIsoDay(day);
  if (!date) return null;

  const targetMonth = date.getMonth() + months;
  const anchorDay = date.getDate();

  // Day 0 of the following month is the last day of the target month
  const lastOfTarget = new Date(date.getFullYear(), targetMonth + 1, 0).getDate();
  const next = new Date(date.getFullYear(), targetMonth, Math.min(anchorDay, lastOfTarget));
  return toIsoDay(next);
}

/**
 * Adds whole days to a date.
 *
 * Built from calendar components rather than by adding milliseconds, because
 * `fromIsoDay` hands back local midnights and two local midnights either side
 * of a daylight-saving change are not 24 hours apart. Adding seven days to
 * 2026-10-26 by arithmetic gives 1 November; by the calendar it gives the 2nd,
 * which is what "next Monday" means to the person booking it.
 */
export function addDays(day: string, days: number): string | null {
  const date = fromIsoDay(day);
  if (!date) return null;
  return toIsoDay(new Date(date.getFullYear(), date.getMonth(), date.getDate() + days));
}

/** Adds one cadence to a date, whichever unit it is counted in. */
export function addInterval(day: string, interval: Interval): string | null {
  return interval.unit === 'days'
    ? addDays(day, interval.every)
    : addMonths(day, interval.every);
}

/** Whole days from one ISO day to another. Negative when the first is later. */
export function daysBetween(from: string, to: string): number {
  const a = fromIsoDay(from);
  const b = fromIsoDay(to);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/**
 * Whole calendar months from one ISO day to another, rounded down.
 *
 * Only ever used to guess how many occurrences have passed before the exact
 * answer is walked to, so the month-end case it gets wrong — the 31st against
 * a month with thirty days — costs a single correction step rather than a
 * wrong date.
 */
function monthsBetween(from: string, to: string): number {
  const a = fromIsoDay(from);
  const b = fromIsoDay(to);
  if (!a || !b) return 0;
  const months = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  return b.getDate() < a.getDate() ? months - 1 : months;
}

/** "every 3 months", "every 10 days" — the way somebody would say it. */
export function intervalText(interval: Interval): string {
  const { every, unit } = interval;
  if (unit === 'days') {
    if (every === 1) return 'every day';
    if (every === 7) return 'every week';
    if (every === 14) return 'every fortnight';
    return `every ${every} days`;
  }
  if (every === 1) return 'every month';
  if (every === 12) return 'every year';
  if (every === 24) return 'every 2 years';
  return `every ${every} months`;
}

/** Whether a cadence is one this arithmetic can actually walk. */
export function isUsableInterval(interval: Interval | null | undefined): interval is Interval {
  if (!interval) return false;
  if (!Number.isInteger(interval.every) || interval.every < 1) return false;
  return interval.unit === 'days' || interval.unit === 'months';
}

/**
 * A plan's cadence, for plans written before one could be counted in days.
 *
 * Read through this rather than off the fields, the way `jobKindOf` stands in
 * front of a job's kind: every plan in a browser today carries `everyMonths`
 * and nothing rewrites stored records.
 */
export function intervalOf(plan: {
  everyMonths: number;
  every?: number;
  unit?: IntervalUnit;
}): Interval {
  if (typeof plan.every === 'number' && plan.unit) {
    return { every: plan.every, unit: plan.unit };
  }
  return { every: plan.everyMonths, unit: 'months' };
}

/**
 * What this asset says about this plan: nothing, its own cadence, or exempt.
 *
 * `undefined` and `null` are different answers and must stay different —
 * absent means "follow the category", null means "this one is not on it at
 * all" — so this returns three things rather than falling back on `??`.
 * A bare number is a record written before days were an option.
 */
export function overrideOf(
  equipment: Equipment,
  planId: string
): Interval | null | undefined {
  const stored = equipment.planOverrides?.[planId];
  if (stored === undefined) return undefined;
  if (stored === null) return null;
  if (typeof stored === 'number') {
    return Number.isInteger(stored) && stored > 0 ? { every: stored, unit: 'months' } : null;
  }
  return isUsableInterval(stored) ? stored : null;
}

/** The id a scheduled job carries, derived so an occurrence cannot repeat. */
export function scheduledJobIdFor(planId: string, equipmentId: string, dueOn: string): string {
  return `mnt-plan-${planId}-${equipmentId}-${dueOn}`;
}

/**
 * The cadence this asset keeps for this plan, or null when it is exempt.
 *
 * An override on the asset wins over its category's rule, which is the whole
 * point of having one: the estate services its fridges every six months and
 * the one in the window gets looked at every six weeks.
 */
export function intervalFor(equipment: Equipment, plan: MaintenancePlan): Interval | null {
  const override = overrideOf(equipment, plan.id);
  if (override === null) return null;
  if (override) return override;

  const rule = intervalOf(plan);
  return isUsableInterval(rule) ? rule : null;
}

export interface DueOccurrence {
  plan: MaintenancePlan;
  equipment: Equipment;
  /** The day this service is due, ISO. */
  dueOn: string;
  /** The id the job would carry, whether or not it exists yet. */
  jobId: string;
  /** Days past due. Negative before it falls due. */
  daysOverdue: number;
}

/**
 * The clock a plan counts from for one asset.
 *
 * The last time this plan was actually carried out on this asset, if it ever
 * was — a service done early or late resets the interval from when the work
 * happened, which is what "every three months" means to the person doing it.
 * Failing that, the day the asset went in. Failing that, the day it was
 * written down, so an asset with no install date still comes due eventually
 * instead of never.
 */
export function anchorFor(
  plan: MaintenancePlan,
  equipment: Equipment,
  jobs: MaintenanceJob[],
  today?: string
): string | null {
  const completed = jobs
    .filter(
      (j) =>
        j.planId === plan.id &&
        j.equipmentId === equipment.id &&
        j.completedAt !== null
    )
    .map((j) => toIsoDay(new Date(j.completedAt as string)))
    /*
     * Work dated after today is ignored rather than trusted. The latest
     * completion is the clock, so a service mistyped as 2027 would otherwise
     * suppress the asset's schedule for a year — silently, and on an asset
     * somebody had just been diligent about.
     */
    .filter((day) => !today || daysBetween(day, today) >= 0)
    .sort();

  if (completed.length > 0) return completed[completed.length - 1];
  if (equipment.installedOn) return equipment.installedOn.slice(0, 10);
  return equipment.createdAt ? equipment.createdAt.slice(0, 10) : null;
}

/**
 * When this plan next falls due on this asset, and whether that has passed.
 *
 * Every occurrence is measured from the anchor — the nth is `anchor + n
 * intervals`, never "the one before it plus one more". Stepping from the
 * previous result compounds two separate faults. A monthly plan anchored on
 * the 31st lands on the 28th in February and, fed back in, keeps the 28th for
 * ever, so an interval the operator set on the last of the month quietly
 * becomes the 28th of every month. And walking one step at a time needs a cap,
 * which a cadence counted in days exhausts inside a year: the old cap of 400
 * steps returned a date four years stale for a weekly service, and returned it
 * as a perfectly ordinary ISO day that nothing downstream could tell from a
 * right answer.
 *
 * So the count is calculated and then corrected. The estimate is exact for
 * days and out by at most one for months — the 31st against a thirty-day month
 * — which the two correction loops settle in a step.
 */
export function nextDueFor(
  plan: MaintenancePlan,
  equipment: Equipment,
  jobs: MaintenanceJob[],
  today: string
): { dueOn: string; daysOverdue: number } | null {
  const interval = intervalFor(equipment, plan);
  if (!isUsableInterval(interval)) return null;

  const anchor = anchorFor(plan, equipment, jobs, today);
  if (!anchor) return null;

  /** The nth occurrence, always measured from the anchor. */
  const occurrence = (n: number): string | null =>
    addInterval(anchor, { every: interval.every * n, unit: interval.unit });

  const elapsed =
    interval.unit === 'days' ? daysBetween(anchor, today) : monthsBetween(anchor, today);

  /*
   * The most recent occurrence that has fallen due, not the first. An asset
   * installed two years ago on a quarterly plan has eight occurrences behind
   * it, and raising all eight would bury the board in services nobody is going
   * to carry out retrospectively. The honest reading of "it is overdue" is one
   * job, due on the latest date that has passed.
   */
  let n = Math.max(1, Math.floor(elapsed / interval.every));

  // A handful of steps, because the estimate is never more than one out
  const CORRECTIONS = 4;
  for (let step = 0; step < CORRECTIONS; step += 1) {
    const after = occurrence(n + 1);
    if (!after || daysBetween(after, today) < 0) break;
    n += 1;
  }
  for (let step = 0; step < CORRECTIONS && n > 1; step += 1) {
    const at = occurrence(n);
    if (at && daysBetween(at, today) >= 0) break;
    n -= 1;
  }

  const dueOn = occurrence(n);
  if (!dueOn) return null;

  return { dueOn, daysOverdue: daysBetween(dueOn, today) };
}

/**
 * Every service that has fallen due and has no job standing for it.
 *
 * An asset with work already open for a plan is skipped: a printer nobody has
 * serviced since April does not need a second job saying so in July. The one
 * outstanding job is the truth, and its age is what says how late it is.
 */
export function dueOccurrences(
  today: string,
  plans: MaintenancePlan[] = activePlans(),
  equipment: Equipment[] = getEquipment(),
  jobs: MaintenanceJob[] = getJobs()
): DueOccurrence[] {
  const openByPair = new Set(
    jobs
      .filter((j) => jobKindOf(j) === 'scheduled' && statusOf(j) !== 'completed')
      .map((j) => `${j.planId}::${j.equipmentId}`)
  );
  const existingIds = new Set(jobs.map((j) => j.id));

  const out: DueOccurrence[] = [];

  equipment
    .filter((e) => e.active)
    .forEach((item) => {
      plans
        .filter((p) => p.category === item.category)
        .forEach((plan) => {
          if (openByPair.has(`${plan.id}::${item.id}`)) return;

          const next = nextDueFor(plan, item, jobs, today);
          if (!next || next.daysOverdue < 0) return;

          const jobId = scheduledJobIdFor(plan.id, item.id, next.dueOn);
          if (existingIds.has(jobId)) return;

          out.push({
            plan,
            equipment: item,
            dueOn: next.dueOn,
            jobId,
            daysOverdue: next.daysOverdue,
          });
        });
    });

  return out.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}

/** The job a due occurrence becomes. */
export function jobForOccurrence(occurrence: DueOccurrence, now: string): MaintenanceJob {
  const { plan, equipment, dueOn, jobId } = occurrence;
  const where = [equipment.location, equipment.serialNumber && `serial ${equipment.serialNumber}`]
    .filter(Boolean)
    .join(', ');
  // What this asset actually keeps, which is not the plan's rule when it has
  // an interval of its own — the job should say the cadence it came round on
  const cadence = intervalFor(equipment, plan) ?? intervalOf(plan);

  return {
    id: jobId,
    branchName: equipment.branchName,
    title: `${plan.task} — ${equipment.name}`,
    details: [
      `Scheduled ${plan.task.toLowerCase()}, due ${dueOn}.`,
      `Falls due ${intervalText(cadence)}.`,
      where ? `Unit: ${equipment.name} (${where}).` : `Unit: ${equipment.name}.`,
      plan.instructions ?? null,
    ]
      .filter(Boolean)
      .join(' '),
    equipment: equipment.name,
    category: equipment.category,
    priority: plan.priority,
    /*
     * Named as the schedule rather than as a person: nobody reported this, it
     * came round. Putting a name here would credit someone with noticing
     * something that was noticed by arithmetic.
     */
    reportedBy: 'Maintenance schedule',
    /*
     * Reported on the day it fell due, not the day the app happened to be
     * opened. Otherwise a service that came due in April and was first seen
     * in September would read as three days old, and the month-end report
     * would file it under the wrong month.
     */
    reportedAt: new Date(`${dueOn}T09:00:00`).toISOString(),
    startedAt: null,
    completedAt: null,
    attendedBy: null,
    resolutionNote: null,
    cost: null,
    photo: null,
    kind: 'scheduled',
    equipmentId: equipment.id,
    planId: plan.id,
    dueOn,
  };
}

export interface SweepResult {
  raised: MaintenanceJob[];
  /** Occurrences that fell due but could not be written — storage full. */
  failed: number;
}

/**
 * Brings the board up to date with the schedule.
 *
 * Called once when the app mounts. Safe to call repeatedly and from several
 * tabs: every job it writes has a derived id, so a second run finds the work
 * already there and does nothing.
 *
 * `now` is passed in rather than read here so the caller — and the tests —
 * decide what day it is.
 */
export function sweepSchedule(now: Date = new Date()): SweepResult {
  const today = toIsoDay(now);
  const stamp = now.toISOString();

  const due = dueOccurrences(today);
  const raised: MaintenanceJob[] = [];
  let failed = 0;

  due.forEach((occurrence) => {
    const job = jobForOccurrence(occurrence, stamp);
    if (saveJob(job)) raised.push(job);
    else failed += 1;
  });

  return { raised, failed };
}

/**
 * What is coming, for the schedule screen: every asset-and-plan pairing with
 * the day it next falls due, whether or not a job stands for it yet.
 */
export interface UpcomingService {
  plan: MaintenancePlan;
  equipment: Equipment;
  dueOn: string;
  daysOverdue: number;
  /** The job standing for it, once one has been raised. */
  job: MaintenanceJob | null;
}

export function upcomingServices(
  today: string,
  plans: MaintenancePlan[] = activePlans(),
  equipment: Equipment[] = getEquipment(),
  jobs: MaintenanceJob[] = getJobs()
): UpcomingService[] {
  const out: UpcomingService[] = [];

  equipment
    .filter((e) => e.active)
    .forEach((item) => {
      plans
        .filter((p) => p.category === item.category)
        .forEach((plan) => {
          const open = jobs.find(
            (j) =>
              j.planId === plan.id &&
              j.equipmentId === item.id &&
              statusOf(j) !== 'completed'
          );

          if (open) {
            out.push({
              plan,
              equipment: item,
              dueOn: open.dueOn ?? today,
              daysOverdue: daysBetween(open.dueOn ?? today, today),
              job: open,
            });
            return;
          }

          const next = nextDueFor(plan, item, jobs, today);
          if (!next) return;
          out.push({ plan, equipment: item, dueOn: next.dueOn, daysOverdue: next.daysOverdue, job: null });
        });
    });

  return out.sort((a, b) => a.dueOn.localeCompare(b.dueOn));
}
