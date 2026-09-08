import { Branch, Inspection, User } from '../types';
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
 * A branch at random, favouring whoever has gone longest unvisited.
 *
 * Same reasoning as the inspector draw: the point of a surprise visit is
 * coverage, and an even draw leaves a branch that has not been seen in two
 * months no likelier to be picked than one seen last week.
 */
export function randomBranch(branches: Branch[] = activeBranches()): Branch | null {
  const open = activeBranches(branches);
  if (open.length === 0) return null;

  const submitted = getInspections().filter((i) => i.status === 'submitted');
  // '' sorts before any date, so a branch never inspected counts as longest
  const lastSeen = (branch: Branch) =>
    submitted
      .filter((i) => i.branchName === branch.name)
      .reduce((latest, i) => (i.date > latest ? i.date : latest), '');

  const oldest = open.reduce(
    (best, branch) => (lastSeen(branch) < lastSeen(best) ? branch : best),
    open[0]
  );
  const staleness = lastSeen(oldest);

  return pick(open.filter((b) => lastSeen(b) === staleness));
}

export interface CreateSurpriseInput {
  branchName: string;
  /** The inspector it is handed to. */
  inspectorId: string;
  /** The admin raising it. */
  raisedBy: User;
  /** Overridden in tests; defaults to now. */
  now?: Date;
}

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
  const { branchName, inspectorId, raisedBy, now = new Date() } = input;

  if (!branchName) return { ok: false, error: 'Choose the branch to be visited' };

  const inspector = activeInspectors().find((u) => u.id === inspectorId);
  if (!inspector) return { ok: false, error: 'Choose the inspector to send' };

  const duplicate = getInspections().find(
    (i) =>
      i.status === 'assigned' &&
      i.assignedToUserId === inspectorId &&
      i.branchName === branchName
  );
  if (duplicate) {
    return {
      ok: false,
      error: `${inspector.name} already has an unstarted surprise visit to ${branchName}`,
    };
  }

  const inspection: Inspection = {
    id: `insp-${Date.now()}`,
    branchName,
    date: todayISO(now),
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
    assignedByUserId: raisedBy.id,
    assignedAt: now.toISOString(),
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
