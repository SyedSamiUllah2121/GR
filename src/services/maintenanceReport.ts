import {
  MaintenanceCategory,
  MaintenanceJob,
  MaintenanceStatus,
  Severity,
} from '../types';
import { statusOf, turnaroundHours, workMinutes } from './maintenanceStore';

/**
 * The month-end maintenance report.
 *
 * A job belongs to the month it was *completed* in, because that is the month
 * the work was actually done. Jobs still open are reported separately as a
 * carried-forward backlog rather than being counted as work done — otherwise
 * a month could show effort that has not happened yet.
 */

export interface BranchMaintenanceSummary {
  branchName: string;
  completed: number;
  /** Reported during the month, whether or not it was finished. */
  raised: number;
  /** Still unfinished as at the end of the month. */
  openAtMonthEnd: number;
  /** Mean hours from report to completion, for jobs completed in the month. */
  averageTurnaroundHours: number | null;
  /** Total on-site work time for jobs completed in the month, in minutes. */
  totalWorkMinutes: number;
  /** Summed where recorded; null when no completed job carried a cost. */
  totalCost: number | null;
  byCategory: { key: MaintenanceCategory; count: number }[];
  bySeverity: Record<Severity, number>;
  jobs: MaintenanceJob[];
}

export interface MonthlyMaintenanceReport {
  /** "2026-09" */
  month: string;
  monthLabel: string;
  completed: number;
  raised: number;
  openAtMonthEnd: number;
  averageTurnaroundHours: number | null;
  totalWorkMinutes: number;
  totalCost: number | null;
  branches: BranchMaintenanceSummary[];
  byCategory: { key: MaintenanceCategory; count: number }[];
  bySeverity: Record<Severity, number>;
  /** Unfinished jobs, oldest first — the backlog going into next month. */
  backlog: MaintenanceJob[];
}

const SEVERITIES: Severity[] = ['critical', 'high', 'medium', 'low'];

/** "2026-09" for an ISO timestamp, in the reader's own timezone. */
export function monthKeyOf(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** "September 2026" from a "2026-09" key. */
export function monthLabel(month: string): string {
  const [year, m] = month.split('-').map(Number);
  if (!year || !m) return month;
  return new Date(year, m - 1, 1).toLocaleDateString('en-GB', {
    month: 'long',
    year: 'numeric',
  });
}

/** The month a job counts towards: the one its work finished in. */
function completedMonth(job: MaintenanceJob): string | null {
  return job.completedAt ? monthKeyOf(job.completedAt) : null;
}

/**
 * Every month that has something to report, newest first. A month appears if
 * work was completed in it or a problem was raised in it.
 */
export function availableMonths(jobs: MaintenanceJob[]): string[] {
  const months = new Set<string>();
  jobs.forEach((job) => {
    const raised = monthKeyOf(job.reportedAt);
    if (raised) months.add(raised);
    const done = completedMonth(job);
    if (done) months.add(done);
  });
  return Array.from(months).sort((a, b) => b.localeCompare(a));
}

/** Last instant of the given month, for deciding what was still open then. */
function endOfMonth(month: string): number {
  const [year, m] = month.split('-').map(Number);
  return new Date(year, m, 1).getTime() - 1;
}

function tally(jobs: MaintenanceJob[]) {
  const byCategoryMap = new Map<MaintenanceCategory, number>();
  const bySeverity: Record<Severity, number> = { critical: 0, high: 0, medium: 0, low: 0 };

  jobs.forEach((job) => {
    byCategoryMap.set(job.category, (byCategoryMap.get(job.category) ?? 0) + 1);
    bySeverity[job.priority] += 1;
  });

  const byCategory = Array.from(byCategoryMap.entries())
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));

  return { byCategory, bySeverity };
}

function averageTurnaround(jobs: MaintenanceJob[]): number | null {
  const values = jobs
    .map((job) => turnaroundHours(job))
    .filter((v): v is number => v !== null);
  if (values.length === 0) return null;
  return Math.round((values.reduce((sum, v) => sum + v, 0) / values.length) * 10) / 10;
}

function totalCostOf(jobs: MaintenanceJob[]): number | null {
  const withCost = jobs.filter((job) => typeof job.cost === 'number');
  if (withCost.length === 0) return null;
  return withCost.reduce((sum, job) => sum + (job.cost ?? 0), 0);
}

function totalWork(jobs: MaintenanceJob[]): number {
  return jobs.reduce((sum, job) => sum + (workMinutes(job) ?? 0), 0);
}

export function buildMonthlyReport(
  jobs: MaintenanceJob[],
  month: string
): MonthlyMaintenanceReport {
  const monthEnd = endOfMonth(month);

  const completedInMonth = jobs.filter((job) => completedMonth(job) === month);
  const raisedInMonth = jobs.filter((job) => monthKeyOf(job.reportedAt) === month);

  // Open "as at month end": reported by then, and not finished by then
  const openAtEnd = jobs.filter((job) => {
    const reported = new Date(job.reportedAt).getTime();
    if (Number.isNaN(reported) || reported > monthEnd) return false;
    if (!job.completedAt) return true;
    return new Date(job.completedAt).getTime() > monthEnd;
  });

  const branchNames = Array.from(
    new Set([...completedInMonth, ...raisedInMonth, ...openAtEnd].map((j) => j.branchName))
  ).sort();

  const branches: BranchMaintenanceSummary[] = branchNames
    .map((branchName) => {
      const done = completedInMonth.filter((j) => j.branchName === branchName);
      const raised = raisedInMonth.filter((j) => j.branchName === branchName);
      const open = openAtEnd.filter((j) => j.branchName === branchName);
      const { byCategory, bySeverity } = tally(done);

      return {
        branchName,
        completed: done.length,
        raised: raised.length,
        openAtMonthEnd: open.length,
        averageTurnaroundHours: averageTurnaround(done),
        totalWorkMinutes: totalWork(done),
        totalCost: totalCostOf(done),
        byCategory,
        bySeverity,
        jobs: [...done].sort((a, b) =>
          (a.completedAt ?? '').localeCompare(b.completedAt ?? '')
        ),
      };
    })
    // Most work done first
    .sort((a, b) => b.completed - a.completed || a.branchName.localeCompare(b.branchName));

  const { byCategory, bySeverity } = tally(completedInMonth);

  return {
    month,
    monthLabel: monthLabel(month),
    completed: completedInMonth.length,
    raised: raisedInMonth.length,
    openAtMonthEnd: openAtEnd.length,
    averageTurnaroundHours: averageTurnaround(completedInMonth),
    totalWorkMinutes: totalWork(completedInMonth),
    totalCost: totalCostOf(completedInMonth),
    branches,
    byCategory,
    bySeverity,
    backlog: [...openAtEnd].sort((a, b) => a.reportedAt.localeCompare(b.reportedAt)),
  };
}

// ---------------------------------------------------------------------------
// Board-level counts, for the list screen and the dashboard
// ---------------------------------------------------------------------------

export interface MaintenanceBoard {
  jobs: MaintenanceJob[];
  counts: Record<MaintenanceStatus, number>;
  /** Reported or in progress — the work outstanding right now. */
  openCount: number;
  /** Open jobs at critical or high priority. */
  urgentCount: number;
  branches: string[];
}

export function buildBoard(jobs: MaintenanceJob[]): MaintenanceBoard {
  const counts: Record<MaintenanceStatus, number> = {
    reported: 0,
    'in-progress': 0,
    completed: 0,
  };
  jobs.forEach((job) => {
    counts[statusOf(job)] += 1;
  });

  const open = jobs.filter((job) => statusOf(job) !== 'completed');

  return {
    jobs,
    counts,
    openCount: open.length,
    urgentCount: open.filter((j) => j.priority === 'critical' || j.priority === 'high').length,
    branches: Array.from(new Set(jobs.map((j) => j.branchName))).sort(),
  };
}

/** "2h 30m" from minutes; "—" when there is nothing to show. */
export function formatMinutes(minutes: number | null): string {
  if (minutes === null || minutes <= 0) return '—';
  if (minutes < 60) return `${minutes}m`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

/** "18.5 hours" style turnaround, or days once it runs long. */
export function formatTurnaround(hours: number | null): string {
  if (hours === null) return '—';
  if (hours < 24) return `${hours}h`;
  const days = Math.round((hours / 24) * 10) / 10;
  return `${days}d`;
}

export { SEVERITIES };
