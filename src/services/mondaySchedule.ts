import { Inspection, inspectionKindOf } from '../types';

/**
 * The branch's weekly round.
 *
 * "Happens every Monday" — so the question a branch manager needs answered on
 * arrival is not "how many inspections have there been" but "has *this week's*
 * been done". That is what this works out.
 *
 * Weeks run Monday to Sunday, and the round is due on the Monday. Being late
 * is reported rather than prevented: a branch that was closed on Monday still
 * has to be inspected, and a system that refused the record on Tuesday would
 * simply not have one. The record carries its own date, so lateness stays
 * visible in the history either way.
 */

function toISO(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * The Monday of the week a date falls in, as an ISO date.
 *
 * `getDay()` counts Sunday as 0, which would put a Sunday at the *start* of
 * the coming week rather than the end of the one just gone — hence the shift.
 */
export function weekStart(date: Date): string {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dayFromMonday = (monday.getDay() + 6) % 7;
  monday.setDate(monday.getDate() - dayFromMonday);
  return toISO(monday);
}

/** How many days into the week a date is, 0 on the Monday. */
function dayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

export interface MondayStatus {
  /** The Monday this week is named after, ISO. */
  weekOf: string;
  /** The round for this week, submitted or in progress. Null if not started. */
  inspection: Inspection | null;
  /** True once this week's round is submitted. */
  done: boolean;
  /** True while it is in progress. */
  inProgress: boolean;
  /** True on the Monday itself, with the round still outstanding. */
  dueToday: boolean;
  /** True from the Tuesday on, with the round still outstanding. */
  overdue: boolean;
  /** Days past the Monday. 0 on the day, 3 by Thursday. */
  daysLate: number;
  /** The last round submitted before this week, for "last inspected". */
  previous: Inspection | null;
}

/**
 * Where a branch stands on its weekly round.
 *
 * Only Monday rounds count towards it. A surprise visit does not discharge
 * the branch's own inspection — they answer different questions, and letting
 * one stand in for the other would mean a branch that got an unannounced
 * visit never inspected itself that week.
 */
export function mondayStatusFor(
  branchName: string,
  inspections: Inspection[],
  now: Date = new Date()
): MondayStatus {
  const weekOf = weekStart(now);
  const rounds = inspections
    .filter((i) => i.branchName === branchName && inspectionKindOf(i) === 'monday')
    .sort((a, b) => b.date.localeCompare(a.date));

  const thisWeek =
    rounds.find((i) => weekStart(new Date(`${i.date}T00:00:00`)) === weekOf) ?? null;

  const done = thisWeek?.status === 'submitted';
  const daysLate = dayIndex(now);

  return {
    weekOf,
    inspection: thisWeek,
    done,
    inProgress: thisWeek?.status === 'draft',
    dueToday: !done && daysLate === 0,
    overdue: !done && daysLate > 0,
    daysLate,
    previous:
      rounds.find(
        (i) =>
          i.status === 'submitted' &&
          weekStart(new Date(`${i.date}T00:00:00`)) !== weekOf
      ) ?? null,
  };
}

