import {
  MAINTENANCE_CATEGORY_LABEL,
  MaintenanceCategory,
  MaintenanceJob,
  MaintenanceStatus,
  Severity,
} from '../types';
import { daysOpen, statusOf, turnaroundHours, workMinutes } from './maintenanceStore';

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

// ---------------------------------------------------------------------------
// Kit that keeps breaking
// ---------------------------------------------------------------------------

/**
 * A unit at a branch that has been reported more than once.
 *
 * Grouped by the equipment rather than the fault, because "the dining AC has
 * failed three times" is the thing worth acting on — whether it was warm air
 * twice and a noisy fan once does not change that it is the unit at fault.
 * Jobs with no equipment recorded fall back to their title, which is the best
 * identity a hand-logged job has.
 */
export interface RepeatGroup {
  key: string;
  /** The unit, as most recently written. */
  label: string;
  branchName: string;
  /** Every occurrence, newest first. */
  jobs: MaintenanceJob[];
  times: number;
  firstReportedAt: string;
  lastReportedAt: string;
  /** Occurrences still outstanding. */
  openCount: number;
  /** Days from the first report to the most recent. */
  spanDays: number;
  worstPriority: Severity;
  /** Total of the costs recorded; null when none were. */
  totalCost: number | null;
}

/** Same unit written two ways — "Split AC 2" and "split ac  2" — is one unit. */
function unitKey(job: MaintenanceJob): string {
  const raw = job.equipment.trim() || job.title.trim();
  return raw.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function daysBetweenIso(from: string, to: string): number {
  const a = new Date(from).getTime();
  const b = new Date(to).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.max(Math.round((b - a) / 86400000), 0);
}

/**
 * Units reported more than once, worst offenders first.
 *
 * A single job is not a repeat, so groups of one are dropped — this list is
 * only useful if everything on it is a pattern.
 */
export function buildRepeats(jobs: MaintenanceJob[]): RepeatGroup[] {
  const groups = new Map<string, MaintenanceJob[]>();

  jobs.forEach((job) => {
    const key = `${job.branchName.toLowerCase()}::${unitKey(job)}`;
    const found = groups.get(key);
    if (found) found.push(job);
    else groups.set(key, [job]);
  });

  const rank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

  return Array.from(groups.entries())
    .filter(([, group]) => group.length > 1)
    .map(([key, group]) => {
      const byNewest = [...group].sort((a, b) => b.reportedAt.localeCompare(a.reportedAt));
      const costs = group.map((j) => j.cost).filter((c): c is number => c !== null);
      const first = byNewest[byNewest.length - 1].reportedAt;
      const last = byNewest[0].reportedAt;

      return {
        key,
        // The newest spelling wins; older jobs may name the unit less precisely
        label: byNewest[0].equipment.trim() || byNewest[0].title.trim(),
        branchName: byNewest[0].branchName,
        jobs: byNewest,
        times: group.length,
        firstReportedAt: first,
        lastReportedAt: last,
        openCount: group.filter((j) => statusOf(j) !== 'completed').length,
        spanDays: daysBetweenIso(first, last),
        worstPriority: group.reduce<Severity>(
          (worst, j) => (rank[j.priority] < rank[worst] ? j.priority : worst),
          'low'
        ),
        totalCost: costs.length > 0 ? costs.reduce((sum, c) => sum + c, 0) : null,
      };
    })
    .sort(
      (a, b) =>
        b.times - a.times ||
        b.openCount - a.openCount ||
        b.lastReportedAt.localeCompare(a.lastReportedAt)
    );
}

// ---------------------------------------------------------------------------
// Live overview — the maintenance dashboard
// ---------------------------------------------------------------------------

/**
 * Where maintenance stands right now, across every branch and all of time.
 *
 * Deliberately a different question from the month-end report above: that one
 * closes a period and counts work *done in it*, this one is about the state of
 * the estate today and what keeps going wrong. A job that has been open for
 * three months is invisible in a month-end report and is exactly what this
 * page exists to surface.
 */

/** An open job past this many days is chased rather than merely counted. */
export const AGEING_DAYS = 7;

export interface CategoryStat {
  key: MaintenanceCategory;
  label: string;
  total: number;
  open: number;
  /** Mean hours from report to completion, where any were completed. */
  averageTurnaroundHours: number | null;
  cost: number | null;
}

export interface BranchStat {
  branchName: string;
  total: number;
  open: number;
  urgentOpen: number;
  /** Units at this branch that have been reported more than once. */
  repeatUnits: number;
  averageTurnaroundHours: number | null;
  cost: number | null;
}

export interface TrendPoint {
  month: string;
  label: string;
  raised: number;
  completed: number;
}

export interface MaintenanceOverview {
  empty: boolean;
  total: number;
  open: number;
  inProgress: number;
  notStarted: number;
  completed: number;
  urgentOpen: number;

  /** Open jobs past AGEING_DAYS, oldest first. */
  ageing: MaintenanceJob[];
  oldestOpen: MaintenanceJob | null;
  /** Days the oldest open job has been waiting. */
  oldestOpenDays: number;

  averageTurnaroundHours: number | null;
  /** Share of all jobs that have been finished, 0-100. */
  completionRate: number;
  totalCost: number | null;

  bySeverity: Record<Severity, number>;
  byCategory: CategoryStat[];
  byBranch: BranchStat[];
  /** Worst repeat offenders, most frequent first. */
  repeats: RepeatGroup[];
  /** Jobs on units that keep failing — the share of all work that is rework. */
  repeatShare: number;
  /** Newest month last, for a left-to-right chart. */
  trend: TrendPoint[];
  /** Still open, worst priority then longest waiting. */
  attention: MaintenanceJob[];
}

function sumCosts(jobs: MaintenanceJob[]): number | null {
  const costs = jobs.map((j) => j.cost).filter((c): c is number => c !== null);
  return costs.length > 0 ? costs.reduce((sum, c) => sum + c, 0) : null;
}

/** The last `count` months ending with the current one, oldest first. */
function recentMonths(count: number, now: Date): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

export function buildMaintenanceOverview(
  jobs: MaintenanceJob[],
  now: Date = new Date()
): MaintenanceOverview {
  const open = jobs.filter((j) => statusOf(j) !== 'completed');
  const completed = jobs.filter((j) => statusOf(j) === 'completed');
  const rank: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

  const ageing = open
    .filter((j) => daysOpen(j, now) >= AGEING_DAYS)
    .sort((a, b) => a.reportedAt.localeCompare(b.reportedAt));

  const oldestOpen =
    open.length > 0
      ? [...open].sort((a, b) => a.reportedAt.localeCompare(b.reportedAt))[0]
      : null;

  const { byCategory: categoryCounts, bySeverity } = tally(jobs);

  const byCategory: CategoryStat[] = categoryCounts.map(({ key, count }) => {
    const inCategory = jobs.filter((j) => j.category === key);
    return {
      key,
      label: MAINTENANCE_CATEGORY_LABEL[key],
      total: count,
      open: inCategory.filter((j) => statusOf(j) !== 'completed').length,
      averageTurnaroundHours: averageTurnaround(inCategory),
      cost: sumCosts(inCategory),
    };
  });

  const repeats = buildRepeats(jobs);
  const repeatJobIds = new Set(repeats.flatMap((g) => g.jobs.map((j) => j.id)));

  const branchNames = Array.from(new Set(jobs.map((j) => j.branchName))).sort();
  const byBranch: BranchStat[] = branchNames
    .map((branchName) => {
      const atBranch = jobs.filter((j) => j.branchName === branchName);
      const openHere = atBranch.filter((j) => statusOf(j) !== 'completed');
      return {
        branchName,
        total: atBranch.length,
        open: openHere.length,
        urgentOpen: openHere.filter(
          (j) => j.priority === 'critical' || j.priority === 'high'
        ).length,
        repeatUnits: repeats.filter((g) => g.branchName === branchName).length,
        averageTurnaroundHours: averageTurnaround(atBranch),
        cost: sumCosts(atBranch),
      };
    })
    // Worst first: most still open, then most repeat offenders
    .sort((a, b) => b.open - a.open || b.repeatUnits - a.repeatUnits || b.total - a.total);

  const months = recentMonths(6, now);
  const trend: TrendPoint[] = months.map((month) => ({
    month,
    label: monthLabel(month).replace(/ \d{4}$/, ''),
    raised: jobs.filter((j) => monthKeyOf(j.reportedAt) === month).length,
    completed: jobs.filter((j) => j.completedAt && monthKeyOf(j.completedAt) === month).length,
  }));

  return {
    empty: jobs.length === 0,
    total: jobs.length,
    open: open.length,
    inProgress: open.filter((j) => statusOf(j) === 'in-progress').length,
    notStarted: open.filter((j) => statusOf(j) === 'reported').length,
    completed: completed.length,
    urgentOpen: open.filter((j) => j.priority === 'critical' || j.priority === 'high').length,

    ageing,
    oldestOpen,
    oldestOpenDays: oldestOpen ? daysOpen(oldestOpen, now) : 0,

    averageTurnaroundHours: averageTurnaround(jobs),
    completionRate: jobs.length > 0 ? Math.round((completed.length / jobs.length) * 100) : 0,
    totalCost: sumCosts(jobs),

    bySeverity,
    byCategory,
    byBranch,
    repeats,
    repeatShare: jobs.length > 0 ? Math.round((repeatJobIds.size / jobs.length) * 100) : 0,
    trend,

    attention: [...open]
      .sort(
        (a, b) =>
          rank[a.priority] - rank[b.priority] || a.reportedAt.localeCompare(b.reportedAt)
      )
      .slice(0, 6),
  };
}
