import { Answer, Inspection, Item, ReasonGroup, Severity } from '../types';

/**
 * Priority of a flagged (No) issue is worked out from three things:
 *
 *   1. the item's own `severity` — what it means for that check to fail
 *   2. the reason given — an issue already in hand is less urgent than one
 *      caused by neglect, and some reasons describe a worse condition than
 *      the check itself implies
 *   3. the branch's own record — something flagged again on the next visit
 *      is a management failure, not a one-off
 *
 * The result is deterministic: the same issue always scores the same, which is
 * what an inspection record needs. Priority is computed on read rather than
 * stored, and history only ever looks at inspections dated strictly before the
 * one being scored, so a submitted report's priorities never shift later.
 */

const RANKED: Severity[] = ['low', 'medium', 'high', 'critical'];

export const SEVERITY_RANK: Record<Severity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

/** Critical issues must carry photo evidence before an inspection can be submitted. */
export function requiresPhoto(severity: Severity): boolean {
  return severity === 'critical';
}

/**
 * How the chosen reason moves an issue up or down one level. Only non-zero
 * entries are listed; anything unlisted (including 'Other') leaves the item's
 * own severity as it stands. Keyed by reason group so that two lists using the
 * same wording for different things stay independent.
 */
const REASON_DELTAS: Partial<Record<ReasonGroup, Record<string, number>>> = {
  STAFF: {
    'Staff did not follow instruction': 1,
    'Waiting for new uniform or stock': -1,
  },
  CLEANING: {
    'Surface damaged, cannot be cleaned properly': 1,
    'Cleaning staff absent today': -1,
    'Heavy rush, cleaning delayed': -1,
  },
  EQUIPMENT: {
    'Equipment not working, out of order': 1,
    'Power or gas supply issue': 1,
    'Consumable finished (bulb, refill, gas)': -1,
  },
  SUPPLY: {
    'Stock finished, not reordered': 1,
    'Reorder placed, awaiting delivery': -1,
  },
  FOOD: {
    'Expired item not removed': 1,
  },
  PEST: {
    'Entry point or gap found in the area': 1,
    'Waste not cleared, attracting pests': 1,
    'Treated recently, still monitoring': -1,
  },
  RECORDS: {
    'Staff not trained to maintain it': 1,
    'Filled late, entries have gaps': -1,
  },
  SAFETY: {
    'Inspection or service expired': 1,
    'Unit missing from its location': 1,
    'Access to the unit is blocked': 1,
  },
  TEMPERATURE: {
    // Food is out of temperature control and will stay that way until fixed
    'Unit not holding temperature, needs service': 1,
    // Nothing on the temperature regime can be trusted without a working probe
    'Probe not available or not calibrated': 1,
    // Correctable there and then, on the spot
    'Food not left long enough to reach temperature': -1,
  },
};

/** How many past visits to a branch are weighed when spotting repeat issues. */
export const HISTORY_LOOKBACK = 3;

export interface FailureHistory {
  /** Item id -> how many of the visits below flagged it. */
  counts: Record<number, number>;
  /** How many past visits were actually found (0-HISTORY_LOOKBACK). */
  visits: number;
}

export const EMPTY_HISTORY: FailureHistory = { counts: {}, visits: 0 };

/**
 * Past failures at `branchName` from the visits immediately before `before`.
 * Only submitted inspections dated strictly earlier count, so scoring an old
 * report does not pick up inspections that happened after it.
 */
export function buildFailureHistory(
  inspections: Inspection[],
  branchName: string,
  before: Pick<Inspection, 'id' | 'date'>
): FailureHistory {
  const past = inspections
    .filter(
      (i) =>
        i.status === 'submitted' &&
        i.branchName === branchName &&
        i.id !== before.id &&
        i.date < before.date
    )
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, HISTORY_LOOKBACK);

  const counts: Record<number, number> = {};
  past.forEach((inspection) => {
    Object.entries(inspection.answers).forEach(([itemId, answer]) => {
      if (answer.status === 'no') {
        const id = Number(itemId);
        counts[id] = (counts[id] || 0) + 1;
      }
    });
  });

  return { counts, visits: past.length };
}

export interface IssuePriority {
  severity: Severity;
  /** The item's own severity, before reason and history were applied. */
  base: Severity;
  /** What the rules arrived at, which an override may then have replaced. */
  computed: Severity;
  /** True when an inspector set this priority by hand. */
  overridden: boolean;
  reasonDelta: number;
  repeatCount: number;
  historyVisits: number;
  /** Plain-language account of how this priority was reached. */
  factors: string[];
}

/**
 * Priority for an item marked No. Callers should only render this for
 * `answer.status === 'no'`; a passing item has no issue to rank.
 */
export function computePriority(
  item: Item,
  answer: Answer | undefined,
  history: FailureHistory = EMPTY_HISTORY
): IssuePriority {
  const base = item.severity;
  const factors: string[] = [`Item risk: ${SEVERITY_LABEL[base]}`];

  const reason = answer?.reason;
  const reasonDelta = (reason && REASON_DELTAS[item.reasonGroup]?.[reason]) || 0;
  if (reasonDelta > 0) {
    factors.push(`"${reason}" makes it worse`);
  } else if (reasonDelta < 0) {
    factors.push(`"${reason}" — already being handled`);
  }

  const repeatCount = history.counts[item.id] || 0;
  const repeatDelta = repeatCount > 0 ? 1 : 0;
  if (repeatDelta > 0) {
    factors.push(
      `Repeat issue — flagged in ${repeatCount} of the last ${history.visits} visit${
        history.visits === 1 ? '' : 's'
      }`
    );
  }

  const index = Math.min(
    RANKED.length - 1,
    Math.max(0, SEVERITY_RANK[base] + reasonDelta + repeatDelta)
  );
  const computed = RANKED[index];

  // An inspector can overrule the rules on a specific issue
  const override = answer?.priorityOverride ?? null;
  const overridden = !!override && override !== computed;
  const severity = override ?? computed;
  if (overridden) {
    factors.push(`Set to ${SEVERITY_LABEL[severity]} by hand (rules said ${SEVERITY_LABEL[computed]})`);
  }

  if (requiresPhoto(severity)) {
    factors.push('Photo evidence required before submitting');
  }

  return {
    severity,
    base,
    computed,
    overridden,
    reasonDelta,
    repeatCount,
    historyVisits: history.visits,
    factors,
  };
}

export interface RankedIssue {
  item: Item;
  answer: Answer;
  priority: IssuePriority;
}

/** Most serious first; ties keep checklist order so the list stays stable. */
export function sortByPriority(issues: RankedIssue[]): RankedIssue[] {
  return [...issues].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[b.priority.severity] - SEVERITY_RANK[a.priority.severity];
    if (bySeverity !== 0) return bySeverity;
    return a.item.id - b.item.id;
  });
}

export type SeverityCounts = Record<Severity, number>;

export function countBySeverity(issues: RankedIssue[]): SeverityCounts {
  const counts: SeverityCounts = { critical: 0, high: 0, medium: 0, low: 0 };
  issues.forEach((issue) => {
    counts[issue.priority.severity] += 1;
  });
  return counts;
}

/** Critical issues that still have no photo attached — these block submission. */
export function missingPhotoEvidence(issues: RankedIssue[]): RankedIssue[] {
  return issues.filter((issue) => requiresPhoto(issue.priority.severity) && !issue.answer.photo);
}
