import { Branch, Inspection, User, inspectionKindOf } from '../types';
import { activeBranches } from './branchStore';
import { inspectors as activeInspectors } from './userStore';
import { deleteInspection, getInspections, saveActiveDraft, saveInspection } from './storage';

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
  const candidates = activeInspectors(users);
  if (candidates.length === 0) return null;

  const open = getInspections().filter((i) => i.status === 'assigned');
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

  return pick(withoutLast.length > 0 ? withoutLast : deck);
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
  const { branchName, inspectorId, raisedBy, scheduledFor = null, now = new Date() } = input;

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
   * A second unstarted visit to the same branch by the same inspector, due at
   * the same moment, is a double-click rather than a plan — and one the
   * inspector could not tell from the first. Two due at *different* times are
   * a plan, and allowed: that is what naming a time is for.
   */
  const dueKey = due ? due.toISOString().slice(0, 16) : null;
  const duplicate = getInspections().find(
    (i) =>
      i.status === 'assigned' &&
      i.assignedToUserId === inspectorId &&
      i.branchName === branchName &&
      (i.scheduledFor ? i.scheduledFor.slice(0, 16) : null) === dueKey
  );
  if (duplicate) {
    return {
      ok: false,
      error: dueKey
        ? `${inspector.name} is already booked to visit ${branchName} then`
        : `${inspector.name} already has an unstarted surprise visit to ${branchName}`,
    };
  }

  const inspection: Inspection = {
    id: `insp-${Date.now()}`,
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
 * False for one with no time named: those are due whenever the inspector can
 * get there, so there is no moment for them to be late against.
 */
export function isOverdueAssignment(
  inspection: Pick<Inspection, 'status' | 'scheduledFor'>,
  now: Date = new Date()
): boolean {
  if (inspection.status !== 'assigned' || !inspection.scheduledFor) return false;
  const due = new Date(inspection.scheduledFor);
  return !Number.isNaN(due.getTime()) && due.getTime() < now.getTime();
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
