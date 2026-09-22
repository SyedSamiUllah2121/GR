import { Branch, Inspection, User, inspectionKindOf } from '../types';
import { activeBranches } from './branchStore';
import { inspectors as activeInspectors } from './userStore';
import { deleteInspection, getInspections, saveActiveDraft, saveInspection } from './storage';
import { autoSurpriseIntervalDays } from './settings';

/**
 * Surprise visits.
 *
 * A surprise visit exists before anyone carries it out: the admin raises it,
 * names a branch and hands it to an inspector, and it sits in that
 * inspector's list until they go. So it is stored as an inspection with
 * status `assigned` and no answers, rather than as a separate kind of record
 * — the same row becomes the draft when the visit starts and the report when
 * it is submitted, which is what keeps the inspector's list, the branch's
 * history and the dashboard all reading from one place.
 */

/** Local calendar date, not the UTC one — a visit raised late at night
 *  otherwise files under tomorrow. */
function todayISO(now: Date): string {
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

function timeString(now: Date): string {
  return now
    .toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true })
    .toLowerCase();
}

/**
 * Surprise visits that have not finished: due, or being carried out.
 *
 * A visit ends when it is submitted. Until then it is outstanding whether the
 * inspector has started it or not — an assignment sitting in somebody's list
 * and a half-filled draft are both work that has not been done, and either is
 * a reason not to raise a second one over the top of it.
 *
 * Only surprise visits. A Monday round is every branch's standing weekly
 * obligation, so counting those would mean no branch was ever free.
 */
function outstandingVisits(all: Inspection[] = getInspections()): Inspection[] {
  return all.filter((i) => inspectionKindOf(i) === 'surprise' && i.status !== 'submitted');
}

/** The unfinished surprise visit at this branch, if it has one. */
export function outstandingVisitAt(
  branchName: string,
  all: Inspection[] = getInspections()
): Inspection | null {
  return outstandingVisits(all).find((i) => i.branchName === branchName) ?? null;
}

/** The unfinished surprise visit this inspector is carrying, if any. */
export function outstandingVisitFor(
  userId: string,
  all: Inspection[] = getInspections()
): Inspection | null {
  return outstandingVisits(all).find((i) => i.assignedToUserId === userId) ?? null;
}

/** Picks one at random, or null from an empty list. */
function pick<T>(items: T[]): T | null {
  if (items.length === 0) return null;
  return items[Math.floor(Math.random() * items.length)];
}

/**
 * An inspector at random, favouring whoever is carrying the least.
 *
 * "Receive randomly assigned Surprise Visits" — but random with no memory
 * hands one person three visits while another waits, so the draw is between
 * the inspectors with the fewest visits outstanding rather than all of them.
 * Still unpredictable to a branch, which is the property that matters.
 */
export function randomInspector(users: User[] = activeInspectors()): User | null {
  const all = getInspections();
  /*
   * Anyone already carrying an unfinished visit is out of the draw, not merely
   * at the back of it. One visit at a time is the rule the form enforces, and
   * a draw that could return somebody the form would then refuse is a draw
   * that hands the admin an error instead of an inspector.
   */
  const candidates = activeInspectors(users).filter((u) => !outstandingVisitFor(u.id, all));
  if (candidates.length === 0) return null;

  const open = all.filter((i) => i.status === 'assigned');
  const load = (user: User) => open.filter((i) => i.assignedToUserId === user.id).length;
  const lightest = Math.min(...candidates.map(load));

  return pick(candidates.filter((u) => load(u) === lightest));
}

/**
 * Every surprise visit ever raised, oldest first.
 *
 * Ordered by when it was handed over rather than by the date it is filed
 * under, because two visits raised on the same day still have an order and
 * the draw below depends on it. Records made before assignments were
 * timestamped fall back to their date, which sorts a bare day before any
 * timestamp within it — old enough not to matter, and never out of place.
 */
function surpriseVisitsOldestFirst(): Inspection[] {
  return getInspections()
    .filter((i) => inspectionKindOf(i) === 'surprise')
    .sort((a, b) => (a.assignedAt ?? a.date).localeCompare(b.assignedAt ?? b.date));
}

/**
 * What is left of the current round, worked out by dealing the whole history
 * out again from the start.
 *
 * Replayed forwards rather than read backwards from the newest visits. Going
 * backwards cannot see where a round began: a run of four distinct branches
 * is equally the round just finished and the round just started, and reading
 * it as the latter lets a branch be drawn twice in a row. Dealing forwards
 * never has to guess — the deck empties where it empties.
 *
 * Branches no longer open are skipped, and one opened mid-round joins the
 * next deal rather than being dealt into a round already under way.
 */
function roundRemaining(open: Branch[]): Branch[] {
  const openNames = new Set(open.map((b) => b.name));
  let remaining = new Set(openNames);

  for (const visit of surpriseVisitsOldestFirst()) {
    if (!openNames.has(visit.branchName)) continue;
    // The deck ran out on the visit before this one, so this one is dealt
    // from a fresh deal
    if (remaining.size === 0) remaining = new Set(openNames);
    remaining.delete(visit.branchName);
  }

  return open.filter((b) => remaining.has(b.name));
}

/** The branch drawn most recently, so a deal never repeats it back to back. */
function lastDrawnBranch(): string | null {
  const visits = surpriseVisitsOldestFirst();
  return visits.length > 0 ? visits[visits.length - 1].branchName : null;
}

/**
 * A branch at random, drawn like a card from a deck rather than rolled like
 * a die: unpredictable, but every branch comes up before any comes up twice.
 *
 * An even draw is unpredictable and covers nothing — over seven branches it
 * will happily miss one for months. Picking the longest unvisited covers
 * everything and is not a draw at all: with seven branches on seven
 * different dates the answer is the same one every time, which a branch
 * expecting an unannounced visit can work out as easily as we can. Neither
 * is what a surprise visit needs, which is both properties at once.
 *
 * So the round is what is tracked, and chance only decides the order within
 * it. The round is read back from the visits themselves — the longest run of
 * recent ones with no branch repeated — rather than kept as a counter, so it
 * cannot drift from what was actually raised, and a branch opened or closed
 * mid-round simply changes what the round is measured against.
 *
 * Visits count from the moment they are handed over, not when they are
 * carried out, so raising one takes that branch out of the running
 * immediately. Only surprise visits count: the Monday round already calls
 * everywhere every week, and this is the draw that has to be unannounced.
 */
export function randomBranch(branches: Branch[] = activeBranches()): Branch | null {
  const open = activeBranches(branches);
  if (open.length === 0) return null;

  // Spent deck: deal a fresh one rather than return nothing
  const remaining = roundRemaining(open);
  const deck = remaining.length > 0 ? remaining : open;

  /*
   * A fresh deal can otherwise land on the branch that ended the last round,
   * which is the one moment this draw could send an inspector to the same
   * place twice running — the one thing a rotation is supposed to prevent.
   * Dropped only while something else is left to draw, so a single branch
   * still answers every time.
   */
  const last = lastDrawnBranch();
  const withoutLast = deck.filter((b) => b.name !== last);
  const dealable = withoutLast.length > 0 ? withoutLast : deck;

  /*
   * A branch with a visit already outstanding is out of the draw for the same
   * reason an inspector is: the form would refuse it. Applied to the deal
   * rather than to the round, so a branch that is merely busy today still
   * counts as unvisited and comes up once it is free — skipping it here would
   * quietly let it fall out of the rotation altogether.
   */
  const all = getInspections();
  const free = dealable.filter((b) => !outstandingVisitAt(b.name, all));

  return pick(free);
}

export interface CreateSurpriseInput {
  branchName: string;
  /** The inspector it is handed to. */
  inspectorId: string;
  /** The admin raising it. */
  raisedBy: User;
  /**
   * When it should be carried out, as an ISO timestamp. Null or absent means
   * as soon as the inspector can get there.
   */
  scheduledFor?: string | null;
  /**
   * The far end of the window, when it is a window rather than a moment.
   * Requires `scheduledFor`.
   */
  scheduledUntil?: string | null;
  /** Overridden in tests; defaults to now. */
  now?: Date;
}

/**
 * A minute's grace on a scheduled time.
 *
 * "Now" is a moving target: the admin reads the clock, fills the form and
 * presses the button, by which point the time they typed is a few seconds
 * past. Refusing that as history would be pedantic about a visit they plainly
 * mean to happen immediately.
 */
const SCHEDULE_GRACE_MS = 60_000;

export interface CreateSurpriseResult {
  ok: boolean;
  error?: string;
  inspection?: Inspection;
}

/**
 * Raises a surprise visit and hands it to an inspector.
 *
 * Refuses a second open assignment for the same inspector at the same branch
 * — two identical unstarted visits are a double-click, not a plan, and the
 * inspector cannot tell them apart to know which one they have done.
 */
export function createSurpriseVisit(input: CreateSurpriseInput): CreateSurpriseResult {
  const {
    branchName,
    inspectorId,
    raisedBy,
    scheduledFor = null,
    scheduledUntil = null,
    now = new Date(),
  } = input;

  if (!branchName) return { ok: false, error: 'Choose the branch to be visited' };

  const inspector = activeInspectors().find((u) => u.id === inspectorId);
  if (!inspector) return { ok: false, error: 'Choose the inspector to send' };

  /*
   * The time it is due, when one was named. Validated here rather than left
   * to the form, so a visit can never be filed against a date nothing can
   * happen on — a report dated before the record existed reads as tampering.
   */
  let due: Date | null = null;
  if (scheduledFor) {
    due = new Date(scheduledFor);
    if (Number.isNaN(due.getTime())) {
      return { ok: false, error: 'That date and time could not be read' };
    }
    if (due.getTime() < now.getTime() - SCHEDULE_GRACE_MS) {
      return { ok: false, error: 'Choose a time that has not already passed' };
    }
  }

  /*
   * The far end of the window, when one is given. Requires a start: an end
   * on its own would be a deadline with no opening, which the form has no way
   * to show and the inspector no way to read.
   */
  let until: Date | null = null;
  if (scheduledUntil) {
    if (!due) return { ok: false, error: 'Set a start time as well as an end time' };
    until = new Date(scheduledUntil);
    if (Number.isNaN(until.getTime())) {
      return { ok: false, error: 'That end time could not be read' };
    }
    if (until.getTime() <= due.getTime()) {
      return { ok: false, error: 'The end of the window has to be after its start' };
    }
  }

  /*
   * One unfinished surprise visit per branch, and one per inspector.
   *
   * Not a double-click guard — a real rule about the estate. Two outstanding
   * visits to one branch are two people about to walk the same floor over the
   * same checklist, and the second finds every fault the first already raised;
   * two on one inspector is a queue they can only work through one at a time,
   * and the older one quietly reads as late. Either way the second is almost
   * always somebody forgetting the first was there.
   *
   * Both ways round, and whichever way the visit was chosen: the draw and the
   * admin's own hand are equally capable of picking a branch that is already
   * busy, and the branch is no less busy for having been named deliberately.
   */
  const busyBranch = outstandingVisitAt(branchName);
  if (busyBranch) {
    return {
      ok: false,
      error:
        busyBranch.status === 'assigned'
          ? `${branchName} already has a surprise visit waiting to be started — that one has to be finished or withdrawn first`
          : `A surprise visit to ${branchName} is already under way — it has to be finished first`,
    };
  }

  const busyInspector = outstandingVisitFor(inspectorId);
  if (busyInspector) {
    return {
      ok: false,
      error:
        busyInspector.status === 'assigned'
          ? `${inspector.name} already has a surprise visit to ${busyInspector.branchName} waiting to be started`
          : `${inspector.name} is part way through a surprise visit to ${busyInspector.branchName}`,
    };
  }

  /*
   * Unique even when two are raised in the same millisecond, which hand
   * assignment now makes reachable: a repeat is allowed, and `Date.now()`
   * alone would have the second overwrite the first in the records store
   * rather than joining it.
   */
  const existingIds = new Set(getInspections().map((i) => i.id));
  let id = `insp-${Date.now()}`;
  for (let n = 2; existingIds.has(id); n += 1) id = `insp-${Date.now()}-${n}`;

  const inspection: Inspection = {
    id,
    branchName,
    /*
     * Filed against the day it is due, not the day it was raised, so a visit
     * booked for Friday sits under Friday in the inspector's list. Unscheduled
     * ones keep today, which is what they always had.
     */
    date: todayISO(due ?? now),
    time: timeString(due ?? now),
    status: 'assigned',
    score: 0,
    signature: null,
    answers: {},
    currentSectionIndex: 0,
    inspectorName: inspector.name,
    inspectionType: 'routine',
    kind: 'surprise',
    assignedToUserId: inspector.id,
    assignedByUserId: raisedBy.id,
    assignedAt: now.toISOString(),
    // Only carried when a time was actually named, so "no time given" stays
    // distinguishable from "due the moment it was raised"
    ...(due ? { scheduledFor: due.toISOString() } : {}),
    ...(until ? { scheduledUntil: until.toISOString() } : {}),
  };

  saveInspection(inspection);
  return { ok: true, inspection };
}

/** The surprise visits handed to someone and not yet started, newest first. */
export function assignmentsFor(userId: string, all: Inspection[] = getInspections()): Inspection[] {
  return all
    .filter((i) => i.status === 'assigned' && i.assignedToUserId === userId)
    .sort((a, b) => (b.assignedAt ?? '').localeCompare(a.assignedAt ?? ''));
}

/**
 * Whether a booked visit is past the time it was due.
 *
 * Measured against the close of the window when there is one, not its
 * opening: a visit carried out at any point inside its window is on time,
 * however late into it the inspector arrives — that latitude is the reason
 * for giving a window at all. A single moment is its own deadline.
 *
 * False for one with no time named: those are due whenever the inspector can
 * get there, so there is no moment for them to be late against.
 */
export function isOverdueAssignment(
  inspection: Pick<Inspection, 'status' | 'scheduledFor' | 'scheduledUntil'>,
  now: Date = new Date()
): boolean {
  if (inspection.status !== 'assigned') return false;
  const deadline = inspection.scheduledUntil ?? inspection.scheduledFor;
  if (!deadline) return false;
  const at = new Date(deadline);
  return !Number.isNaN(at.getTime()) && at.getTime() < now.getTime();
}

/**
 * The booked time as one readable phrase, or null when nothing was booked.
 *
 * Lives here rather than in each screen because the inspector's list, the
 * notification and the admin's confirmation all have to describe the same
 * booking, and three phrasings of one window is how they start disagreeing.
 */
export function scheduleLabel(
  inspection: Pick<Inspection, 'scheduledFor' | 'scheduledUntil'>,
  formatDateTime: (iso: string) => string,
  formatTimeOnly: (iso: string) => string
): string | null {
  if (!inspection.scheduledFor) return null;
  const from = formatDateTime(inspection.scheduledFor);
  if (!inspection.scheduledUntil) return from;

  /*
   * A window inside one day names that day once: "11 Sept, 10:30 - 14:00"
   * rather than repeating the date on both ends. Across days it has to say
   * both, or "10:30 - 09:00" reads as going backwards.
   */
  const sameDay =
    inspection.scheduledFor.slice(0, 10) === inspection.scheduledUntil.slice(0, 10);
  return sameDay
    ? `${from} – ${formatTimeOnly(inspection.scheduledUntil)}`
    : `${from} – ${formatDateTime(inspection.scheduledUntil)}`;
}

/** Every unstarted surprise visit, for the admin's view of what is outstanding. */
export function openAssignments(all: Inspection[] = getInspections()): Inspection[] {
  return all
    .filter((i) => i.status === 'assigned')
    .sort((a, b) => (b.assignedAt ?? '').localeCompare(a.assignedAt ?? ''));
}

/**
 * Starts an assigned visit.
 *
 * The assignment becomes the draft in place — same id, so the record the
 * admin raised is the record that gets submitted. The date and time are
 * restamped to now: they were the moment it was *assigned*, and the report
 * measures the visit, which may be days later.
 */
export function startAssignment(inspection: Inspection, now: Date = new Date()): Inspection {
  const started: Inspection = {
    ...inspection,
    status: 'draft',
    date: todayISO(now),
    time: timeString(now),
    startedAt: now.toISOString(),
    currentSectionIndex: 0,
  };

  saveInspection(started);
  saveActiveDraft(started);
  return started;
}

/** Withdraws an unstarted assignment. Only ever an admin's to call. */
export function cancelAssignment(id: string): { ok: boolean; error?: string } {
  const inspection = getInspections().find((i) => i.id === id);
  if (!inspection) return { ok: false, error: 'That visit no longer exists' };
  if (inspection.status !== 'assigned') {
    return { ok: false, error: 'That visit has already been started — it cannot be withdrawn' };
  }
  deleteInspection(id);
  return { ok: true };
}


// ---------------------------------------------------------------------------
// Visits the system raises for itself
// ---------------------------------------------------------------------------

/** That ISO day, moved on by `days`. Calendar arithmetic, so it steps over
 *  month ends and the clocks changing without being told about either. */
function addDays(day: string, days: number): string {
  const at = new Date(`${day}T00:00:00`);
  at.setDate(at.getDate() + days);
  return todayISO(at);
}

/** When the most recent surprise visit was raised, as a local ISO day. */
function lastRaisedDay(): string | null {
  const visits = surpriseVisitsOldestFirst();
  const last = visits[visits.length - 1];
  if (!last) return null;
  return (last.assignedAt ?? last.date).slice(0, 10);
}

/**
 * The day the next automatic visit falls due, or null when none is coming.
 *
 * Counted from the last surprise visit *of any kind*, not from the last
 * automatic one: the interval is how long the estate goes without an
 * unannounced visit, and one the admin raised on Tuesday by hand is an
 * unannounced visit. Counting only its own would have the system book a
 * second one the same week and call the gap kept.
 *
 * With no surprise visit on record at all there is nothing to count from, so
 * one is due immediately — which is the honest reading of "every three days"
 * on an estate that has never had one.
 */
export function nextAutoSurpriseDue(
  interval: number = autoSurpriseIntervalDays(),
  now: Date = new Date()
): string | null {
  if (interval <= 0) return null;
  const last = lastRaisedDay();
  return last ? addDays(last, interval) : todayISO(now);
}

export interface SurpriseSweepResult {
  /** The visit raised, when one was. */
  raised: Inspection | null;
  /** The day the next one falls due, or null while the schedule is off. */
  dueOn: string | null;
  /**
   * Why nothing was raised. `not-due` is the ordinary answer and the other
   * three are worth surfacing: a schedule that is on and quiet because there
   * are no inspector accounts looks exactly like one that is working.
   */
  reason?: 'off' | 'not-due' | 'already-raised' | 'no-branch' | 'no-inspector';
}

/**
 * Raises the surprise visit that has fallen due, if one has.
 *
 * Called once when the app mounts, beside the maintenance sweep and for the
 * same reason: a visit that fell due while nobody was signed in should be
 * waiting the next time somebody is, rather than needing an admin to remember.
 *
 * At most one per run, however long the app has been shut. Two months of
 * missed intervals are not eight visits owed — they are one estate that has
 * not been looked at, and eight back-dated assignments in an inspector's list
 * would be a queue nobody can work through and a record of visits nobody made.
 *
 * Safe to run repeatedly and in several tabs at once: the record carries an id
 * derived from the day it fell due, so a second run finds it already there and
 * writes nothing. Which branch and which inspector are the rotation's to
 * answer — `randomBranch` deals from the round exactly as it does for a visit
 * raised by hand, so a branch still cannot come up twice before every other
 * has come up once.
 */
export function sweepSurpriseVisits(now: Date = new Date()): SurpriseSweepResult {
  const interval = autoSurpriseIntervalDays();
  if (interval <= 0) return { raised: null, dueOn: null, reason: 'off' };

  const dueOn = nextAutoSurpriseDue(interval, now)!;
  const today = todayISO(now);
  if (today < dueOn) return { raised: null, dueOn, reason: 'not-due' };

  /*
   * Keyed on the day it fell due rather than on the day it was noticed, so
   * two tabs opening at once — or one opened twice in a morning — agree on
   * which visit this is. `saveInspection` writes by id, so the second run
   * would otherwise quietly replace the first inspector's assignment with a
   * different branch under the same heading.
   */
  const id = `insp-auto-${dueOn}`;
  if (getInspections().some((i) => i.id === id)) {
    return { raised: null, dueOn, reason: 'already-raised' };
  }

  const branch = randomBranch();
  if (!branch) return { raised: null, dueOn, reason: 'no-branch' };

  const inspector = randomInspector();
  if (!inspector) return { raised: null, dueOn, reason: 'no-inspector' };

  /*
   * Dated today, not the day it fell due. The maintenance sweep back-dates a
   * service because the job is a record of work that was owed then; this is a
   * visit somebody has to go and carry out now, and an assignment dated three
   * weeks ago reads as one they have already missed.
   */
  const inspection: Inspection = {
    id,
    branchName: branch.name,
    date: today,
    time: timeString(now),
    status: 'assigned',
    score: 0,
    signature: null,
    answers: {},
    currentSectionIndex: 0,
    inspectorName: inspector.name,
    inspectionType: 'routine',
    kind: 'surprise',
    assignedToUserId: inspector.id,
    assignedAt: now.toISOString(),
    autoRaised: true,
  };

  saveInspection(inspection);
  return { raised: inspection, dueOn };
}
