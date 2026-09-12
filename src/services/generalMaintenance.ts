import { Equipment, Interval, MaintenanceJob, MaintenancePlan } from '../types';
import { getJobs, saveJob, statusOf } from './maintenanceStore';
import { setPlanOverride } from './equipmentStore';
import { activePlans, generalPlanIdFor } from './maintenancePlanStore';
import {
  daysBetween,
  intervalFor,
  isUsableInterval,
  nextDueFor,
  toIsoDay,
} from './maintenanceSchedule';

/**
 * Recording that an asset has been looked after, whenever it happened.
 *
 * The schedule already counts from the last time the work was done, so there
 * is nothing here that reaches into the arithmetic — marking maintenance done
 * writes a completed job, and the clock moves because the clock was always
 * "the most recent completion". That is the whole trick, and it is why this
 * file is short.
 *
 * The case it exists for is the one the operator described: somebody services
 * the fridge in week three of a six-week cycle, because they were there
 * anyway. Nothing on the board says to. They press the button, and the next
 * service falls six weeks from the day they actually did it rather than six
 * weeks from a date the system picked.
 */

/** The general-maintenance plan for an asset's category, when it has one. */
export function generalPlanFor(
  equipment: Equipment,
  plans: MaintenancePlan[] = activePlans()
): MaintenancePlan | null {
  const id = generalPlanIdFor(equipment.category);
  return plans.find((p) => p.id === id) ?? null;
}

/** The id a marked-done record carries, derived so one day cannot record twice. */
export function generalDoneIdFor(equipmentId: string, on: string): string {
  return `mnt-general-${equipmentId}-${on}`;
}

export interface GeneralMaintenanceState {
  plan: MaintenancePlan;
  /** What this asset actually keeps, its own interval included. */
  dueOn: string;
  daysOverdue: number;
  /** Due today or past it — what turns the button red. */
  due: boolean;
  /** The job standing for it on the board, when one has been raised. */
  openJob: MaintenanceJob | null;
}

/**
 * Where an asset stands on its general maintenance, or null when it is not on
 * any — an exempt asset, or a category whose general plan is turned off.
 *
 * Recomputed from the plan and the asset rather than read off
 * `upcomingServices`, which reports an open job's recorded due date in
 * preference to the arithmetic. That is right for a list of what is coming and
 * wrong here: it would hide the real state precisely when a job is open, which
 * is exactly when somebody wants to say the work is done.
 */
export function generalMaintenanceState(
  equipment: Equipment,
  today: string,
  plans: MaintenancePlan[] = activePlans(),
  jobs: MaintenanceJob[] = getJobs()
): GeneralMaintenanceState | null {
  const plan = generalPlanFor(equipment, plans);
  if (!plan || !plan.active) return null;
  if (!isUsableInterval(intervalFor(equipment, plan))) return null;

  const next = nextDueFor(plan, equipment, jobs, today);
  if (!next) return null;

  const openJob =
    jobs.find(
      (j) => j.planId === plan.id && j.equipmentId === equipment.id && statusOf(j) !== 'completed'
    ) ?? null;

  return {
    plan,
    dueOn: next.dueOn,
    daysOverdue: next.daysOverdue,
    due: next.daysOverdue >= 0,
    openJob,
  };
}

export interface RecordGeneralDetails {
  /** The day the work was actually done, ISO. Never later than today. */
  on: string;
  attendedBy: string;
  note: string;
  cost: number | null;
  /**
   * A cadence this asset keeps from now on, when the work has changed
   * somebody's mind about how often it needs looking at.
   *
   * Absent is the ordinary case and the important one: the asset keeps
   * whatever it was already on — its own interval if it had one, its
   * category's if it did not — and the next date falls out of that. Nobody
   * should have to restate the interval to record that a service happened.
   */
  newInterval?: Interval;
}

export interface RecordGeneralResult {
  ok: boolean;
  /** True when an open job on the board was closed rather than a record written. */
  closedOpenJob?: boolean;
  /** When it next falls due, for the toast. */
  nextDueOn?: string;
  /** The work was recorded but the new cadence was not — a partial success. */
  intervalError?: string;
  error?: string;
}

/**
 * Marks an asset's general maintenance as done on a given day.
 *
 * Closes the job standing on the board when there is one, rather than writing
 * a second record beside it. Leaving it open would strand the asset outright:
 * the sweep skips any asset that already has an open scheduled job, so the
 * reset the operator just performed would raise nothing, and the board would
 * keep showing work that had been carried out.
 *
 * The completion is stamped at nine in the morning of the day chosen, not at
 * midnight. The clock is read back through a local `toIsoDay`, and a midnight
 * instant recorded in one timezone reads as the day before in another — which
 * would walk every asset's schedule a day earlier each time it was serviced.
 */
export function recordGeneralMaintenance(
  equipment: Equipment,
  details: RecordGeneralDetails,
  today: string = toIsoDay(new Date())
): RecordGeneralResult {
  const plan = generalPlanFor(equipment);
  if (!plan) {
    return { ok: false, error: 'That category has no general maintenance set up' };
  }
  if (daysBetween(details.on, today) < 0) {
    return { ok: false, error: 'Work cannot be recorded as done on a day that has not arrived' };
  }

  const jobs = getJobs();
  const completedAt = new Date(`${details.on}T09:00:00`).toISOString();
  const attendedBy = details.attendedBy.trim() || null;
  const resolutionNote = details.note.trim() || null;

  const open = jobs.find(
    (j) => j.planId === plan.id && j.equipmentId === equipment.id && statusOf(j) !== 'completed'
  );

  const job: MaintenanceJob = open
    ? {
        ...open,
        // Started when it was done, so a job closed this way is never left
        // carrying an end time without a start time
        startedAt: open.startedAt ?? completedAt,
        completedAt,
        attendedBy: attendedBy ?? open.attendedBy,
        resolutionNote: resolutionNote ?? open.resolutionNote,
        cost: details.cost ?? open.cost,
      }
    : {
        id: generalDoneIdFor(equipment.id, details.on),
        branchName: equipment.branchName,
        title: `${plan.task} — ${equipment.name}`,
        details: [
          `General maintenance carried out on ${details.on}.`,
          equipment.location ? `Unit: ${equipment.name} (${equipment.location}).` : `Unit: ${equipment.name}.`,
        ].join(' '),
        equipment: equipment.name,
        category: equipment.category,
        priority: plan.priority,
        /*
         * Recorded by the person, not by the schedule — unlike a job the sweep
         * raises, this one exists because somebody says they did the work.
         */
        reportedBy: attendedBy ?? 'Recorded on the register',
        reportedAt: completedAt,
        startedAt: completedAt,
        completedAt,
        attendedBy,
        resolutionNote,
        cost: details.cost,
        photo: null,
        kind: 'scheduled',
        equipmentId: equipment.id,
        planId: plan.id,
        dueOn: details.on,
      };

  if (!saveJob(job)) {
    return { ok: false, error: 'There is no room left in this browser to store that' };
  }

  /*
   * The new cadence is written after the work, not before, so a full browser
   * that refused the job does not leave the asset on an interval for a service
   * it has no record of.
   */
  let subject = equipment;
  if (details.newInterval) {
    const saved = setPlanOverride(equipment.id, plan.id, details.newInterval);
    if (!saved.ok) {
      return {
        ok: true,
        closedOpenJob: !!open,
        nextDueOn: nextDueFor(plan, equipment, getJobs(), today)?.dueOn,
        intervalError: saved.error ?? 'The work was recorded, but the new interval was not',
      };
    }
    if (saved.equipment) subject = saved.equipment;
  }

  // Asked of the board as it now stands, so the date quoted is the one the
  // operator will actually see on the row a moment later
  const next = nextDueFor(plan, subject, getJobs(), today);
  return { ok: true, closedOpenJob: !!open, nextDueOn: next?.dueOn };
}
