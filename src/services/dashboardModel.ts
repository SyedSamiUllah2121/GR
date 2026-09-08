import { Branch, Inspection, Item, ReasonGroup, Severity } from '../types';
import { ChecklistView } from './checklistStore';
import { RankedIssue, SeverityCounts } from './priority';
import { ReportModel, buildReportModel } from './reportModel';

/**
 * The estate-wide overview.
 *
 * Every figure is aggregated from the same `buildReportModel` each report
 * screen uses, rather than recounted here, so the dashboard cannot disagree
 * with the record it links to.
 *
 * Two different questions are being answered, and the panels say which:
 *   - "where does the estate stand now" reads only each branch's latest visit
 *   - "what keeps happening" reads the whole history
 */

export interface BranchSnapshot {
  name: string;
  /** Where the branch is, for the row subtitle. Empty for a name only found in records. */
  location: string;
  visitCount: number;
  latest: ReportModel | null;
  /** Score change against the visit before the latest one. */
  delta: number | null;
  /** Oldest to newest, for the sparkline. */
  scoreHistory: { date: string; score: number }[];
  nextDueDate: string | null;
  /** Days past the due date; 0 when it is not yet due. */
  daysOverdue: number;
  /** True when this branch has never had a submitted inspection. */
  neverInspected: boolean;
}

export interface CategoryCount {
  key: ReasonGroup;
  failures: number;
  /** How many branches this category is currently failing at. */
  branches: number;
}

export interface SectionWeakness {
  key: string;
  listLabel: string;
  title: string;
  passed: number;
  total: number;
  rate: number;
}

export interface RepeatIssue {
  item: Item;
  branchName: string;
  /** Visits at that branch which flagged it. */
  visits: number;
  severity: Severity;
}

export interface DashboardModel {
  /** True when there is nothing to summarise yet. */
  empty: boolean;
  draft: Inspection | null;

  totalInspections: number;
  /** Mean of each branch's latest score — the estate as it stands. */
  averageScore: number | null;
  latestVisitDate: string | null;
  today: string;

  branches: BranchSnapshot[];
  overdue: BranchSnapshot[];
  neverInspected: BranchSnapshot[];

  /** Findings on each branch's latest visit, by priority. */
  severityTotals: SeverityCounts;
  findingsTotal: number;
  /** Submitted records with no manager signature — a compliance gap. */
  unsignedCount: number;

  byCategory: CategoryCount[];
  weakestSections: SectionWeakness[];
  repeatIssues: RepeatIssue[];

  /** Newest first, for the activity list. */
  recent: ReportModel[];
}

/** Today as a plain local ISO date. */
function todayIso(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

/** Whole days from `from` to `to`, both plain ISO dates, worked out in UTC. */
function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

/**
 * @param branches the configured branch list. Passed in rather than imported
 *   so this stays a pure function of its inputs — branches are editable now,
 *   and a model that read them itself would not recompute when one is added.
 */
export function buildDashboardModel(
  allInspections: Inspection[],
  checklist: ChecklistView,
  branches: Branch[]
): DashboardModel {
  const today = todayIso();
  const draft = allInspections.find((i) => i.status === 'draft') ?? null;

  const submitted = allInspections
    .filter((i) => i.status === 'submitted')
    .sort((a, b) => (a.date === b.date ? a.id.localeCompare(b.id) : a.date.localeCompare(b.date)));

  // One model per record, reused everywhere below
  const models = submitted.map((inspection) =>
    buildReportModel(inspection, checklist, allInspections)
  );

  // A closed branch keeps its records but drops off the board — there is
  // nothing left to chase it for.
  const closed = new Set(branches.filter((b) => b.archived).map((b) => b.name));

  // Names come from the open branches plus anything in the records, so a
  // record filed against a branch since removed from the list still counts.
  const names = Array.from(
    new Set([
      ...branches.filter((b) => !b.archived).map((b) => b.name),
      ...submitted.map((i) => i.branchName).filter((name) => !closed.has(name)),
    ])
  );

  const snapshots: BranchSnapshot[] = names
    .map((name) => {
      const forBranch = models.filter((m) => m.inspection.branchName === name);
      const latest = forBranch.length > 0 ? forBranch[forBranch.length - 1] : null;
      const previous = forBranch.length > 1 ? forBranch[forBranch.length - 2] : null;
      const nextDueDate = latest?.nextDueDate ?? null;

      return {
        name,
        location: branches.find((b) => b.name === name)?.location ?? '',
        visitCount: forBranch.length,
        latest,
        delta:
          latest && previous ? latest.inspection.score - previous.inspection.score : null,
        scoreHistory: forBranch.map((m) => ({
          date: m.inspection.date,
          score: m.inspection.score,
        })),
        nextDueDate,
        daysOverdue: nextDueDate ? Math.max(daysBetween(nextDueDate, today), 0) : 0,
        neverInspected: forBranch.length === 0,
      };
    })
    // Worst first: never inspected, then most overdue, then lowest score
    .sort((a, b) => {
      if (a.neverInspected !== b.neverInspected) return a.neverInspected ? -1 : 1;
      if (a.daysOverdue !== b.daysOverdue) return b.daysOverdue - a.daysOverdue;
      return (a.latest?.score ?? 0) - (b.latest?.score ?? 0);
    });

  // "Where the estate stands" reads each branch's latest visit only
  const latestModels = snapshots
    .map((b) => b.latest)
    .filter((m): m is ReportModel => m !== null);

  const severityTotals: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  latestModels.forEach((m) =>
    (['critical', 'high', 'medium', 'low'] as Severity[]).forEach((s) => {
      severityTotals[s] += m.severityCounts[s];
    })
  );

  const findingsTotal = latestModels.reduce((n, m) => n + m.issues.length, 0);

  // Which concerns are failing right now, and at how many branches
  const categoryFailures = new Map<ReasonGroup, { failures: number; branches: Set<string> }>();
  latestModels.forEach((m) =>
    m.issues.forEach((issue: RankedIssue) => {
      const group = issue.item.reasonGroup;
      const entry = categoryFailures.get(group) ?? { failures: 0, branches: new Set<string>() };
      entry.failures += 1;
      entry.branches.add(m.inspection.branchName);
      categoryFailures.set(group, entry);
    })
  );
  const byCategory: CategoryCount[] = Array.from(categoryFailures.entries())
    .map(([key, v]) => ({ key, failures: v.failures, branches: v.branches.size }))
    .sort((a, b) => b.failures - a.failures || a.key.localeCompare(b.key));

  // Pass rate per checklist category, pooled across the latest visits
  const sectionTotals = new Map<string, SectionWeakness>();
  latestModels.forEach((m) =>
    m.sections.forEach((section) => {
      const key = `${section.listKey}::${section.key}`;
      const entry =
        sectionTotals.get(key) ??
        {
          key,
          listLabel: section.listLabel,
          title: section.title,
          passed: 0,
          total: 0,
          rate: 100,
        };
      entry.passed += section.passed;
      entry.total += section.total;
      sectionTotals.set(key, entry);
    })
  );
  const weakestSections = Array.from(sectionTotals.values())
    .map((s) => ({ ...s, rate: s.total > 0 ? Math.round((s.passed / s.total) * 100) : 100 }))
    .filter((s) => s.rate < 100)
    .sort((a, b) => a.rate - b.rate);

  // "What keeps happening" reads the whole history: the same check flagged on
  // more than one visit to the same branch
  const repeatTally = new Map<string, RepeatIssue>();
  models.forEach((m) =>
    m.issues.forEach(({ item, priority }) => {
      const key = `${m.inspection.branchName}::${item.id}`;
      const entry = repeatTally.get(key);
      if (entry) {
        entry.visits += 1;
        // Keep the worst priority the issue has been given
        if (priority.severity === 'critical') entry.severity = 'critical';
      } else {
        repeatTally.set(key, {
          item,
          branchName: m.inspection.branchName,
          visits: 1,
          severity: priority.severity,
        });
      }
    })
  );
  const repeatIssues = Array.from(repeatTally.values())
    .filter((r) => r.visits > 1)
    .sort((a, b) => b.visits - a.visits || a.item.text.localeCompare(b.item.text));

  const scored = latestModels.map((m) => m.inspection.score);

  return {
    empty: submitted.length === 0,
    draft,
    totalInspections: submitted.length,
    averageScore:
      scored.length > 0
        ? Math.round(scored.reduce((sum, s) => sum + s, 0) / scored.length)
        : null,
    latestVisitDate:
      submitted.length > 0 ? submitted[submitted.length - 1].date : null,
    today,
    branches: snapshots,
    overdue: snapshots.filter((b) => !b.neverInspected && b.daysOverdue > 0),
    neverInspected: snapshots.filter((b) => b.neverInspected),
    severityTotals,
    findingsTotal,
    unsignedCount: submitted.filter((i) => !i.signature).length,
    byCategory,
    weakestSections,
    repeatIssues,
    recent: [...models].reverse(),
  };
}
