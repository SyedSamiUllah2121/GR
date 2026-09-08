import {
  Answer,
  FullSection,
  INSPECTION_INTERVAL_DAYS,
  Inspection,
  Item,
  Severity,
} from '../types';
import { ChecklistView, buildSections } from './checklistStore';
import {
  EMPTY_HISTORY,
  RankedIssue,
  SeverityCounts,
  buildFailureHistory,
  computePriority,
  countBySeverity,
  sortByPriority,
} from './priority';

/**
 * Everything the report screen renders, worked out in one place.
 *
 * The screen itself only lays this out. Keeping the derivation here means the
 * checklist tab, the findings tab and the summary rail cannot drift apart —
 * they all count the same items — and it stays testable without a DOM.
 */

/** An item paired with how it was answered, ready to render in a row. */
export interface ReportRow {
  item: Item;
  answer: Answer | undefined;
  /** 'passed' | 'failed' | 'unanswered'. There is no N/A in the data model. */
  outcome: Outcome;
  /** Section-relative label, e.g. "2.4", matching how the checklist reads. */
  number: string;
  priority: RankedIssue['priority'] | undefined;
}

export type Outcome = 'passed' | 'failed' | 'unanswered';

export interface ReportSection extends FullSection {
  /** 1-based position across the whole report, for the "3." section prefix. */
  index: number;
  rows: ReportRow[];
  passed: number;
  failed: number;
  unanswered: number;
  total: number;
  /** Percentage of the section's items that passed (0-100). */
  rate: number;
}

export interface BranchVisit {
  id: string;
  date: string;
  time: string;
  score: number;
  failed: number;
  isThis: boolean;
}

export interface ReportModel {
  inspection: Inspection;
  sections: ReportSection[];
  rows: ReportRow[];
  total: number;
  passed: number;
  failed: number;
  unanswered: number;
  /** The score this report is presented with — signed value, or live for a draft. */
  score: number;
  /** Recomputed from what is on screen now, which can drift from the signed score. */
  liveScore: number;
  /** How many items the record froze on submit. Equals `total` when nothing drifted. */
  frozenTotal: number;
  /**
   * Items this record answered that the current checklist no longer defines, so
   * they cannot be rendered. Non-zero means the checklist was replaced rather
   * than edited, and the report below is only part of what was inspected.
   */
  missingCount: number;
  /** True when the signed score disagrees with what the rendered items add up to. */
  scoreMismatch: boolean;
  issues: RankedIssue[];
  severityCounts: SeverityCounts;
  repeats: RankedIssue[];
  /** Flagged items whose reason points at repair or servicing work. */
  maintenance: RankedIssue[];
  /** Every answer carrying a written note, passed or failed. */
  notes: ReportRow[];
  /** Every answer carrying a photo. */
  photos: ReportRow[];
  /** This branch's visits, newest first, for the history tab. */
  branchHistory: BranchVisit[];
  /** Minutes between starting and submitting, when both were recorded. */
  durationMinutes: number | null;
  nextDueDate: string | null;
}

/** Reason groups whose failures mean something has to be repaired or serviced. */
const MAINTENANCE_GROUPS = new Set(['MAINTENANCE', 'EQUIPMENT', 'TEMPERATURE', 'SAFETY', 'PEST']);

/**
 * Reasons that name a repair explicitly, so a failure in any group is treated
 * as maintenance work when one of these was given.
 */
const MAINTENANCE_REASONS = new Set([
  'Equipment not working, out of order',
  'Awaiting repair or technician visit',
  'Power or gas supply issue',
  'Surface damaged, cannot be cleaned properly',
  'Item worn out or damaged',
  'Unit not holding temperature, needs service',
  'Door left open or seal damaged',
  'Awaiting service vendor',
  'Inspection or service expired',
  'Entry point or gap found in the area',
]);

function isMaintenance(issue: RankedIssue): boolean {
  if (issue.answer.reason && MAINTENANCE_REASONS.has(issue.answer.reason)) return true;
  return MAINTENANCE_GROUPS.has(issue.item.reasonGroup);
}

/** Human text for a reason, folding the free-text "Other" case back in. */
export function reasonText(answer: Answer | undefined): string {
  if (!answer) return 'No reason given';
  if (answer.reason === 'Other') {
    return `Other: ${answer.otherReason || 'Not specified'}`;
  }
  return answer.reason || 'No reason given';
}

/**
 * Adds whole days to a plain ISO date.
 *
 * The arithmetic and the serialisation both happen in UTC. Parsing as local
 * time and then writing the result with toISOString() mixes the two, and any
 * timezone ahead of UTC comes out a day early — a weekly inspection dated
 * 24 Aug fell due on the 30th instead of the 31st.
 */
function addDays(iso: string, days: number): string | null {
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().split('T')[0];
}

/**
 * The sections this inspection covered. A submitted record renders the items
 * it froze on submit, so editing the master checklist afterwards cannot
 * rewrite what a signed report says; a draft follows the live checklist.
 */
function sectionsFor(inspection: Inspection, checklist: ChecklistView): FullSection[] {
  const frozen = inspection.itemIds;
  if (!frozen || frozen.length === 0) return checklist.sections;

  const covered = new Set(frozen);
  return buildSections(checklist.doc, true)
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => covered.has(item.id)),
    }))
    .filter((section) => section.items.length > 0);
}

export function buildReportModel(
  inspection: Inspection,
  checklist: ChecklistView,
  allInspections: Inspection[]
): ReportModel {
  // Only visits dated before this one count towards repeat-issue escalation,
  // so a report's priorities never shift after it has been printed.
  const history = inspection.date
    ? buildFailureHistory(allInspections, inspection.branchName, {
        id: inspection.id,
        date: inspection.date,
      })
    : EMPTY_HISTORY;

  const rawSections = sectionsFor(inspection, checklist);
  const issues: RankedIssue[] = [];
  const priorityById = new Map<number, RankedIssue['priority']>();

  // Priorities first, so a row can show the badge its finding was given
  rawSections.forEach((section) =>
    section.items.forEach((item) => {
      const answer = inspection.answers[item.id];
      if (answer?.status !== 'no') return;
      const priority = computePriority(item, answer, history);
      priorityById.set(item.id, priority);
      issues.push({ item, answer, priority });
    })
  );

  const sections: ReportSection[] = rawSections.map((section, index) => {
    const rows: ReportRow[] = section.items.map((item, itemIndex) => {
      const answer = inspection.answers[item.id];
      const outcome: Outcome =
        answer?.status === 'yes' ? 'passed' : answer?.status === 'no' ? 'failed' : 'unanswered';
      return {
        item,
        answer,
        outcome,
        number: `${index + 1}.${itemIndex + 1}`,
        priority: priorityById.get(item.id),
      };
    });

    const passed = rows.filter((r) => r.outcome === 'passed').length;
    const failed = rows.filter((r) => r.outcome === 'failed').length;
    return {
      ...section,
      index: index + 1,
      rows,
      passed,
      failed,
      unanswered: rows.length - passed - failed,
      total: rows.length,
      rate: rows.length > 0 ? Math.round((passed / rows.length) * 100) : 100,
    };
  });

  const rows = sections.flatMap((section) => section.rows);
  const passed = rows.filter((r) => r.outcome === 'passed').length;
  const failed = rows.filter((r) => r.outcome === 'failed').length;
  const total = rows.length;

  const ranked = sortByPriority(issues);

  // A submitted record keeps the score it was signed off with; a draft is
  // scored live against what has been answered so far.
  const liveScore = total > 0 ? Math.round((passed / total) * 100) : 0;
  const score = inspection.status === 'submitted' ? inspection.score : liveScore;

  // What the record says it covered, against what the checklist can still show
  const frozenTotal = inspection.itemIds?.length ?? total;
  const missingCount = Math.max(frozenTotal - total, 0);

  const branchHistory: BranchVisit[] = allInspections
    .filter((i) => i.branchName === inspection.branchName && i.status === 'submitted')
    .map((i) => ({
      id: i.id,
      date: i.date,
      time: i.time,
      score: i.score,
      failed: Object.values(i.answers).filter((a) => a.status === 'no').length,
      isThis: i.id === inspection.id,
    }))
    .sort((a, b) => b.date.localeCompare(a.date));

  let durationMinutes: number | null = null;
  if (inspection.startedAt && inspection.submittedAt) {
    const from = new Date(inspection.startedAt).getTime();
    const to = new Date(inspection.submittedAt).getTime();
    if (!Number.isNaN(from) && !Number.isNaN(to) && to > from) {
      durationMinutes = Math.round((to - from) / 60000);
    }
  }

  return {
    inspection,
    sections,
    rows,
    total,
    passed,
    failed,
    unanswered: total - passed - failed,
    score,
    liveScore,
    frozenTotal,
    missingCount,
    scoreMismatch: inspection.status === 'submitted' && inspection.score !== liveScore,
    issues: ranked,
    severityCounts: countBySeverity(ranked),
    repeats: ranked.filter((issue) => issue.priority.repeatCount > 0),
    maintenance: ranked.filter(isMaintenance),
    notes: rows.filter((row) => !!row.answer?.note),
    photos: rows.filter((row) => !!row.answer?.photo),
    branchHistory,
    durationMinutes,
    nextDueDate: inspection.date ? addDays(inspection.date, INSPECTION_INTERVAL_DAYS) : null,
  };
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** "24 Aug 2026" from an ISO date, left as-is if it will not parse. */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const parsed = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/** "24 Aug 2026, 4:10 pm" from an ISO timestamp. */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return '—';
  return `${parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })}, ${parsed
    .toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase()}`;
}

/** "1h 25m" from a count of minutes. */
export function formatDuration(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

export const SEVERITY_ORDER: Severity[] = ['critical', 'high', 'medium', 'low'];
