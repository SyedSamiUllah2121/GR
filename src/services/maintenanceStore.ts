import { MaintenanceJob, MaintenanceStatus } from '../types';
import { SEED_MAINTENANCE } from '../data/seedMaintenance';

/**
 * Maintenance jobs, kept in the browser alongside the inspection records.
 *
 * A job's status is never stored. It is read off the timestamps by
 * `statusOf`, so "in progress" and "has a start time but no end time" cannot
 * drift apart.
 */

const KEY = 'inspection_log_maintenance_v1';
const EVENT = 'inspection_log_maintenance_change';

function notify(): void {
  window.dispatchEvent(new Event(EVENT));
}

export function getJobs(): MaintenanceJob[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) {
      localStorage.setItem(KEY, JSON.stringify(SEED_MAINTENANCE));
      return SEED_MAINTENANCE;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      localStorage.setItem(KEY, JSON.stringify(SEED_MAINTENANCE));
      return SEED_MAINTENANCE;
    }
    return parsed as MaintenanceJob[];
  } catch (err) {
    console.error('Failed to read maintenance jobs:', err);
    return SEED_MAINTENANCE;
  }
}

export function getJobById(id: string): MaintenanceJob | null {
  return getJobs().find((job) => job.id === id) ?? null;
}

export function saveJob(job: MaintenanceJob): void {
  try {
    const all = getJobs();
    const idx = all.findIndex((j) => j.id === job.id);
    const next = idx >= 0 ? all.map((j) => (j.id === job.id ? job : j)) : [job, ...all];
    localStorage.setItem(KEY, JSON.stringify(next));
    notify();
  } catch (err) {
    console.error('Failed to save maintenance job:', err);
  }
}

export function deleteJob(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(getJobs().filter((j) => j.id !== id)));
    notify();
  } catch (err) {
    console.error('Failed to delete maintenance job:', err);
  }
}

export function subscribeToMaintenance(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

// ---------------------------------------------------------------------------
// Remembered name
// ---------------------------------------------------------------------------

const PERSON_KEY = 'inspection_log_maintenance_person';

/**
 * The name last used to report or attend a job. Pre-filling it means the
 * person raising a problem types their name once, not on every job.
 */
export function getLastPerson(): string {
  try {
    return localStorage.getItem(PERSON_KEY) ?? '';
  } catch {
    return '';
  }
}

export function rememberPerson(name: string): void {
  try {
    const trimmed = name.trim();
    if (trimmed) localStorage.setItem(PERSON_KEY, trimmed);
  } catch {
    // Remembering the name is a convenience; losing it is not worth an error
  }
}

// ---------------------------------------------------------------------------
// Derived state
// ---------------------------------------------------------------------------

/** Where a job has got to, from its timestamps alone. */
export function statusOf(job: MaintenanceJob): MaintenanceStatus {
  if (job.completedAt) return 'completed';
  if (job.startedAt) return 'in-progress';
  return 'reported';
}

/** Minutes from starting the work to finishing it, once both are recorded. */
export function workMinutes(job: MaintenanceJob): number | null {
  if (!job.startedAt || !job.completedAt) return null;
  const from = new Date(job.startedAt).getTime();
  const to = new Date(job.completedAt).getTime();
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return null;
  return Math.round((to - from) / 60000);
}

/**
 * Hours from the problem being reported to the work finishing — the figure
 * that says how responsive maintenance actually is, as opposed to how long
 * the repair itself took.
 */
export function turnaroundHours(job: MaintenanceJob): number | null {
  if (!job.completedAt) return null;
  const from = new Date(job.reportedAt).getTime();
  const to = new Date(job.completedAt).getTime();
  if (Number.isNaN(from) || Number.isNaN(to) || to < from) return null;
  return Math.round(((to - from) / 3600000) * 10) / 10;
}

/** How long an unfinished job has been waiting, in whole days. */
export function daysOpen(job: MaintenanceJob, now: Date = new Date()): number {
  if (job.completedAt) return 0;
  const from = new Date(job.reportedAt).getTime();
  if (Number.isNaN(from)) return 0;
  return Math.max(Math.floor((now.getTime() - from) / 86400000), 0);
}

// ---------------------------------------------------------------------------
// Mutations — each returns the changed job, or null when it was not allowed
// ---------------------------------------------------------------------------

/** Marks work as started. Refused when it has already begun or finished. */
export function startJob(job: MaintenanceJob): MaintenanceJob | null {
  if (job.startedAt || job.completedAt) return null;
  const next = { ...job, startedAt: new Date().toISOString() };
  saveJob(next);
  return next;
}

export interface CompletionDetails {
  attendedBy: string;
  resolutionNote: string;
  cost: number | null;
}

/**
 * Marks work as finished. Refused unless it has been started, so a job can
 * never carry an end time without a start time.
 */
export function completeJob(
  job: MaintenanceJob,
  details: CompletionDetails
): MaintenanceJob | null {
  if (!job.startedAt || job.completedAt) return null;
  const next: MaintenanceJob = {
    ...job,
    completedAt: new Date().toISOString(),
    attendedBy: details.attendedBy.trim() || null,
    resolutionNote: details.resolutionNote.trim() || null,
    cost: details.cost,
  };
  saveJob(next);
  return next;
}

/** How long a running job has been going, in minutes. */
export function elapsedMinutes(job: MaintenanceJob, now: Date = new Date()): number | null {
  if (!job.startedAt || job.completedAt) return null;
  const from = new Date(job.startedAt).getTime();
  if (Number.isNaN(from)) return null;
  return Math.max(Math.round((now.getTime() - from) / 60000), 0);
}

// ---------------------------------------------------------------------------
// Correcting the recorded times
// ---------------------------------------------------------------------------

export interface TimeEdit {
  startedAt: string | null;
  completedAt: string | null;
}

/**
 * Corrects the start and finish times on a job — for work that began before
 * anyone got to a screen, or a button pressed at the wrong moment.
 *
 * Refuses anything that would make the record nonsense: a finish without a
 * start, a finish before its start, a start before the problem was reported,
 * or either one in the future. Returns the reason rather than throwing, so the
 * caller can put it beside the field.
 */
export function setJobTimes(
  job: MaintenanceJob,
  times: TimeEdit
): { job?: MaintenanceJob; error?: string } {
  const { startedAt, completedAt } = times;

  if (completedAt && !startedAt) {
    return { error: 'A finish time needs a start time as well' };
  }

  // The picker only offers whole minutes, so both ends of every comparison are
  // taken to the minute. Without this, reporting a problem at 15:40:37 and
  // starting it straight away — which fills in 15:40 — reads as starting
  // before it was reported, and a start of "now" reads as the future.
  const MINUTE = 60000;
  const toMinute = (ms: number) => Math.floor(ms / MINUTE);

  const nowMinute = toMinute(Date.now());
  const reportedRaw = new Date(job.reportedAt).getTime();
  const reportedMinute = Number.isNaN(reportedRaw) ? null : toMinute(reportedRaw);

  let startMinute: number | null = null;
  if (startedAt) {
    const start = new Date(startedAt).getTime();
    if (Number.isNaN(start)) return { error: 'That start time is not a real time' };
    startMinute = toMinute(start);
    if (startMinute > nowMinute) return { error: 'The start time cannot be in the future' };
    if (reportedMinute !== null && startMinute < reportedMinute) {
      return { error: 'Work cannot start before the problem was reported' };
    }
  }

  if (completedAt) {
    const end = new Date(completedAt).getTime();
    if (Number.isNaN(end)) return { error: 'That finish time is not a real time' };
    const endMinute = toMinute(end);
    if (endMinute > nowMinute) return { error: 'The finish time cannot be in the future' };
    if (startMinute !== null && endMinute < startMinute) {
      return { error: 'The finish time is before the start time' };
    }
  }

  const next: MaintenanceJob = { ...job, startedAt, completedAt };
  saveJob(next);
  return { job: next };
}

/** Undoes a start, for when it was pressed by mistake. */
export function reopenJob(job: MaintenanceJob): MaintenanceJob {
  const next: MaintenanceJob = {
    ...job,
    startedAt: null,
    completedAt: null,
    attendedBy: null,
    resolutionNote: null,
    cost: null,
  };
  saveJob(next);
  return next;
}
