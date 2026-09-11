import {
  Equipment,
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

/** Whole days from one ISO day to another. Negative when the first is later. */
export function daysBetween(from: string, to: string): number {
  const a = fromIsoDay(from);
  const b = fromIsoDay(to);
  if (!a || !b) return 0;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

/** The id a scheduled job carries, derived so an occurrence cannot repeat. */
export function scheduledJobIdFor(planId: string, equipmentId: string, dueOn: string): string {
  return `mnt-plan-${planId}-${equipmentId}-${dueOn}`;
}

/**
 * The interval this asset keeps for this plan, in months — or null when it is
 * exempt. An override on the asset wins over its category's rule.
 */
export function intervalFor(equipment: Equipment, plan: MaintenancePlan): number | null {
  const override = equipment.planOverrides?.[plan.id];
  if (override === null) return null;
  if (typeof override === 'number' && override > 0) return override;
  return plan.everyMonths;
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
function anchorFor(
  plan: MaintenancePlan,
  equipment: Equipment,
  jobs: MaintenanceJob[]
): string | null {
  const completed = jobs
    .filter(
      (j) =>
        j.planId === plan.id &&
        j.equipmentId === equipment.id &&
        j.completedAt !== null
    )
    .map((j) => toIsoDay(new Date(j.completedAt as string)))
    .sort();

  if (completed.length > 0) return completed[completed.length - 1];
  if (equipment.installedOn) return equipment.installedOn.slice(0, 10);
  return equipment.createdAt ? equipment.createdAt.slice(0, 10) : null;
}

/**
 * When this plan next falls due on this asset, and whether that has passed.
 *
 * Walks the series forward from the anchor rather than dividing by the
 * interval, because the interval can be changed and the series has to stay
 * anchored to real dates either way. Capped so a nonsense anchor — a date in
 * 1970 against a one-month plan — cannot spin.
 */
export function nextDueFor(
  plan: MaintenancePlan,
  equipment: Equipment,
  jobs: MaintenanceJob[],
  today: string
): { dueOn: string; daysOverdue: number } | null {
  const months = intervalFor(equipment, plan);
  if (months === null) return null;

  const anchor = anchorFor(plan, equipment, jobs);
  if (!anchor) return null;

  let due = addMonths(anchor, months);
  if (!due) return null;

  /*
   * Walk to the most recent occurrence that has fallen due, not the first.
   * An asset installed two years ago on a quarterly plan has eight occurrences
   * behind it, and raising all eight would bury the board in services nobody
   * is going to carry out retrospectively. The honest reading of "it is
   * overdue" is one job, due on the latest date that has passed.
   */
  const MAX_STEPS = 400;
  for (let step = 0; step < MAX_STEPS; step += 1) {
    const after = addMonths(due, months);
    if (!after || daysBetween(after, today) < 0) break;
    due = after;
  }

  return { dueOn: due, daysOverdue: daysBetween(due, today) };
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

  return {
    id: jobId,
    branchName: equipment.branchName,
    title: `${plan.task} — ${equipment.name}`,
    details: [
      `Scheduled ${plan.task.toLowerCase()}, due ${dueOn}.`,
      `Falls due every ${plan.everyMonths} month${plan.everyMonths === 1 ? '' : 's'}.`,
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
