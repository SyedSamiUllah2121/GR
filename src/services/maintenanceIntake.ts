import { Inspection, MaintenanceCategory, MaintenanceJob, ReasonGroup } from '../types';
import { RankedIssue } from './priority';
import { ChecklistView } from './checklistStore';
import { getJobs, saveJob } from './maintenanceStore';

/**
 * Inspection findings that become maintenance jobs.
 *
 * A check whose reason group is MAINTENANCE describes something that has to be
 * repaired rather than corrected on the spot, so failing one raises a job on
 * the maintenance board instead of only appearing in the report. The job opens
 * unstarted — reported, waiting for someone to pick it up.
 *
 * Jobs are raised on submit rather than the moment "No" is tapped: an answer
 * can be changed any number of times while the inspection is still a draft,
 * and each flip would otherwise put another job on the board.
 */

/** The reason group that routes a failure to the maintenance board. */
export const MAINTENANCE_GROUP: ReasonGroup = 'MAINTENANCE';

/**
 * Which trade the job most likely belongs to, guessed from the wording of the
 * check. It is only a starting point so the board is not a wall of "Other" —
 * whoever picks the job up can change it, and anything unrecognised is left
 * as OTHER rather than forced into a category.
 *
 * First match wins, so the more specific patterns are listed first.
 */
const CATEGORY_HINTS: [MaintenanceCategory, RegExp][] = [
  ['REFRIGERATION', /chiller|fridge|refrigerat|freezer|cold room|cooling/i],
  ['AC_VENTILATION', /air.?condition|\bac\b|ventilat|extract|exhaust|hood|fan\b/i],
  ['GAS', /\bgas\b|lpg|cylinder|burner/i],
  ['COOKING_EQUIPMENT', /oven|fryer|grill|griddle|hob|stove|cooker|range|bain.?marie/i],
  ['FIRE_SAFETY', /fire|extinguisher|alarm|smoke|sprinkler|emergency exit/i],
  ['PLUMBING', /plumb|drain|tap\b|sink|water|leak|plug|toilet|wash basin|geyser/i],
  ['ELECTRICAL', /electric|wiring|socket|switch|light|bulb|power|voltage/i],
  ['PEST_CONTROL', /pest|rodent|insect|cockroach|fly killer|bait/i],
  ['STRUCTURAL', /wall|floor|ceiling|tile|door|window|shelf|shelving|paint|grout|fabric/i],
];

/**
 * Reads the recorded kit as well as the question, so "Unit: Split AC 2" is
 * enough to file the job under ventilation even when the question itself only
 * says "cools to temperature".
 */
function guessCategory(issue: RankedIssue): MaintenanceCategory {
  const haystack = [
    issue.item.text,
    ...(issue.item.details ?? []).map((d) => `${d.label} ${d.value}`),
  ].join(' ');
  const hit = CATEGORY_HINTS.find(([, pattern]) => pattern.test(haystack));
  return hit ? hit[0] : 'OTHER';
}

/**
 * A job's id is derived from what raised it, which does two jobs at once: it
 * is unique without a counter, and re-submitting the same inspection lands on
 * the same id rather than raising a duplicate. Generating from a timestamp
 * would have collided outright, since several jobs are raised in one loop.
 */
export function jobIdFor(inspectionId: string, itemId: number): string {
  return `mnt-insp-${inspectionId}-${itemId}`;
}

/** Detail rows worth carrying, i.e. the ones somebody actually filled in. */
function usableDetails(issue: RankedIssue) {
  return (issue.item.details ?? []).filter((d) => d.value.trim());
}

/**
 * What the technician has to go and find. The checklist knows the unit when
 * the question records it — a serial number beats a category title every
 * time — so those values name the job, and the section title is the fallback.
 */
function equipmentFor(issue: RankedIssue, sectionTitle: string | null): string {
  const details = usableDetails(issue);
  if (details.length > 0) return details.map((d) => d.value.trim()).join(' · ');
  return sectionTitle ?? 'Reported by inspection';
}

/** The issues on an inspection that belong on the maintenance board. */
export function maintenanceIssues(issues: RankedIssue[]): RankedIssue[] {
  return issues.filter((issue) => issue.item.reasonGroup === MAINTENANCE_GROUP);
}

/** What the inspector said was wrong, as one readable paragraph. */
function detailsFor(issue: RankedIssue, sectionTitle: string | null): string {
  const { answer } = issue;
  const reason =
    answer.reason === 'Other' ? answer.otherReason?.trim() || 'Other' : answer.reason;

  const kit = usableDetails(issue)
    .map((d) => (d.label.trim() ? `${d.label.trim()} ${d.value.trim()}` : d.value.trim()))
    .join(', ');

  return [
    kit ? `Unit: ${kit}.` : null,
    reason ? `Reason given: ${reason}.` : null,
    answer.note?.trim() ? `Inspector's note: ${answer.note.trim()}` : null,
    sectionTitle ? `Found under "${sectionTitle}" during the branch inspection.` : null,
  ]
    .filter(Boolean)
    .join(' ');
}

export interface IntakeResult {
  /** Jobs newly put on the board by this call. */
  raised: MaintenanceJob[];
  /** Findings that already had a job, so were left alone. */
  alreadyRaised: number;
}

/**
 * Puts a job on the maintenance board for every maintenance-group failure on
 * this inspection that does not have one yet.
 *
 * Safe to call more than once for the same inspection: a finding that already
 * raised a job is skipped, so amending and re-submitting a record does not
 * duplicate work, and a job someone has already started is never rewritten.
 */
export function raiseMaintenanceJobs(
  inspection: Inspection,
  issues: RankedIssue[],
  checklist: ChecklistView
): IntakeResult {
  const candidates = maintenanceIssues(issues);
  if (candidates.length === 0) return { raised: [], alreadyRaised: 0 };

  const existing = new Set(getJobs().map((job) => job.id));
  const reportedAt = inspection.submittedAt ?? new Date().toISOString();

  const raised: MaintenanceJob[] = [];
  let alreadyRaised = 0;

  candidates.forEach((issue) => {
    const id = jobIdFor(inspection.id, issue.item.id);
    if (existing.has(id)) {
      alreadyRaised += 1;
      return;
    }

    const section = checklist.getSectionOf(issue.item.id);
    const job: MaintenanceJob = {
      id,
      branchName: inspection.branchName,
      title: issue.item.text,
      details: detailsFor(issue, section?.title ?? null),
      equipment: equipmentFor(issue, section?.title ?? null),
      category: guessCategory(issue),
      // The priority the report gave it, so the board agrees with the record
      priority: issue.priority.severity,
      reportedBy: inspection.inspectorName?.trim() || 'Branch inspection',
      reportedAt,
      // Unstarted: the job sits in "Reported", waiting to be picked up
      startedAt: null,
      completedAt: null,
      attendedBy: null,
      resolutionNote: null,
      cost: null,
      // Carry the inspector's evidence across rather than asking for it twice
      photo: issue.answer.photo,
      sourceInspectionId: inspection.id,
      sourceItemId: issue.item.id,
    };

    saveJob(job);
    raised.push(job);
  });

  return { raised, alreadyRaised };
}
