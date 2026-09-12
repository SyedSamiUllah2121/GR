import {
  Answer,
  Equipment,
  Inspection,
  Item,
  MaintenanceCategory,
  MaintenanceJob,
  ReasonGroup,
  effectiveDetails,
  effectiveReasonGroup,
  usableDetails,
} from '../types';
import { activeCategories, defaultCategory } from './categoryStore';
import { RankedIssue } from './priority';
import { ChecklistView } from './checklistStore';
import { deleteJob, getJobs, saveJob, statusOf } from './maintenanceStore';
import { activeEquipment } from './equipmentStore';

/**
 * Inspection findings that become maintenance jobs.
 *
 * A failure the inspector marks as repair work raises a job on the
 * maintenance board instead of only appearing in the report. The job opens
 * unstarted — reported, waiting for someone to pick it up.
 *
 * Who decides, in order:
 *
 *   1. the inspector, on the checklist. Anything can break, so the decision
 *      cannot belong to the question: a cleaning check failed because the
 *      surface is damaged is a repair, and a maintenance-group check failed
 *      because staff never reported it is not.
 *   2. failing that, the item's reason group. A MAINTENANCE question is about
 *      repair work by construction, so one left untouched still raises its
 *      job — which is also what keeps records made before inspectors could
 *      mark this behaving as they did.
 *
 * Jobs are raised on submit rather than the moment "No" is tapped: an answer
 * can be changed any number of times while the inspection is still a draft,
 * and each flip would otherwise put another job on the board.
 */

/** The reason group whose failures are repair work unless told otherwise. */
export const MAINTENANCE_GROUP: ReasonGroup = 'MAINTENANCE';

/**
 * Whether this failure goes to the maintenance board — which is simply
 * whether it is filed under MAINTENANCE, by the question or by the inspector.
 */
export function needsMaintenance(item: Item, answer: Answer | undefined): boolean {
  if (answer?.status !== 'no') return false;
  return effectiveReasonGroup(item, answer) === MAINTENANCE_GROUP;
}

/**
 * Which trade the job most likely belongs to, guessed from the wording of the
 * check, so the board is not a wall of "Other". Nobody is asked to confirm
 * it: the inspector says whether something needs repairing, and working out
 * which trade that is belongs to whoever runs the board. Anything
 * unrecognised falls to the fallback category rather than being forced into
 * one that half fits.
 *
 * Kept as authored patterns even though categories are now the operator's own
 * list, because these read the wording of a *fault* — "cold room", "bain
 * marie", "wi-fi" — which is not what a category is called. The operator's
 * labels are matched too, in `suggestCategory`, after these have had their go.
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
  ['IT_EQUIPMENT', /printer|toner|cartridge|\bpos\b|\btill\b|terminal|router|wi.?fi|network|cctv|monitor|scanner/i],
  ['STRUCTURAL', /wall|floor|ceiling|tile|door|window|shelf|shelving|paint|grout|fabric/i],
];

/**
 * Reads the kit as well as the question, so "Unit: Split AC 2" is enough to
 * file the job under ventilation even when the question itself only says
 * "cools to temperature" — and so a unit the inspector typed in while marking
 * counts towards the guess just as an authored one does.
 *
 * Exported because the checklist and the report both name the trade a finding
 * will go to, and what they show has to be what the board actually files it
 * under.
 */
export function suggestCategory(item: Item, answer?: Answer): MaintenanceCategory {
  const haystack = [
    item.text,
    ...effectiveDetails(item, answer).map((d) => `${d.label} ${d.value}`),
  ].join(' ');

  /*
   * The curated patterns first, narrowed to trades still on the list — a
   * chain that withdrew "IT & printers" must not have faults filed under it.
   */
  const live = activeCategories();
  const onOffer = new Set(live.map((c) => c.id));
  const hinted = CATEGORY_HINTS.find(
    ([key, pattern]) => onOffer.has(key) && pattern.test(haystack)
  );
  if (hinted) return hinted[0];

  /*
   * Then the operator's own words. Nobody is going to author a regular
   * expression for a category they add, so the label itself is the pattern:
   * a category called "Fridges" catches a finding that says fridge, and one
   * called "Air conditioners" catches air conditioner. Longest label first, so
   * "Water heating" wins over "Water" rather than losing to list order.
   */
  const text = haystack.toLowerCase();
  const byLabel = [...live]
    .sort((a, b) => b.label.length - a.label.length)
    .find((c) =>
      c.label
        .toLowerCase()
        .split(/[^a-z]+/)
        .filter((word) => word.length > 3)
        .some((word) => text.includes(word) || text.includes(word.replace(/s$/, '')))
    );
  if (byLabel) return byLabel.id;

  return defaultCategory(live);
}

// ---------------------------------------------------------------------------
// Checks that are already somebody else's problem
// ---------------------------------------------------------------------------

/** Why a check is being held, in the words the inspector is shown. */
export type HeldBecause = 'same-check' | 'same-unit';

export interface HeldCheck {
  job: MaintenanceJob;
  because: HeldBecause;
  /** The unit, when it is a unit that is held rather than the check itself. */
  unitName?: string;
}

/**
 * The asset a check names, when it names one on the register.
 *
 * Matched on the whole value of a detail against an asset's name or its serial
 * — exactly, not by substring. A question recording "Unit: Dining area AC 1"
 * finds that asset; one that merely mentions "AC" finds nothing, which is the
 * right answer. Guessing loosely here would hold a check about a different
 * unit, and a check nobody can answer is a worse failure than one that has to
 * be answered twice.
 */
export function assetForCheck(
  item: Item,
  answer: Answer | undefined,
  atBranch: Equipment[]
): Equipment | null {
  const values = usableDetails(effectiveDetails(item, answer)).map((d) =>
    d.value.trim().toLowerCase()
  );
  if (values.length === 0) return null;

  return (
    atBranch.find(
      (asset) =>
        values.includes(asset.name.trim().toLowerCase()) ||
        (!!asset.serialNumber && values.includes(asset.serialNumber.trim().toLowerCase()))
    ) ?? null
  );
}

/**
 * Which checks are already covered by work outstanding on the maintenance
 * board, so the inspector is not asked about them again.
 *
 * This is the answer to a real complaint: the extraction hood has been broken
 * for three weeks, everybody knows, a job is open and somebody is waiting on a
 * part — and every Monday the round asks whether it works, the inspector says
 * no, and the board grows another job for the same fault. The repeat count
 * then reports a branch as deteriorating when nothing has changed.
 *
 * Two ways a check is held, both exact:
 *
 *   same-check  the same question at the same branch raised a job that is
 *               still open. The job records the item it came from, so this
 *               needs no guessing at all.
 *   same-unit   the check names a unit on the register, and that unit has
 *               work outstanding — a repair, or a service somebody has
 *               started. It does not matter which question noticed it.
 *
 * Completed jobs hold nothing. The point is work in hand, not history: a fault
 * repaired last month is exactly what the round should be checking.
 */
export function heldChecks(
  branchName: string,
  items: Item[],
  answers: Record<number, Answer>,
  jobs: MaintenanceJob[] = getJobs(),
  equipment: Equipment[] = activeEquipment()
): Map<number, HeldCheck> {
  const open = jobs.filter(
    (job) => job.branchName === branchName && statusOf(job) !== 'completed'
  );
  if (open.length === 0) return new Map();

  const byItem = new Map<number, MaintenanceJob>();
  const byEquipment = new Map<string, MaintenanceJob>();
  open.forEach((job) => {
    if (job.sourceItemId !== undefined && !byItem.has(job.sourceItemId)) {
      byItem.set(job.sourceItemId, job);
    }
    if (job.equipmentId && !byEquipment.has(job.equipmentId)) {
      byEquipment.set(job.equipmentId, job);
    }
  });

  const atBranch = equipment.filter((e) => e.branchName === branchName);
  const held = new Map<number, HeldCheck>();

  items.forEach((item) => {
    const sameCheck = byItem.get(item.id);
    if (sameCheck) {
      held.set(item.id, { job: sameCheck, because: 'same-check' });
      return;
    }

    const asset = assetForCheck(item, answers[item.id], atBranch);
    if (!asset) return;
    const sameUnit = byEquipment.get(asset.id);
    if (sameUnit) {
      held.set(item.id, { job: sameUnit, because: 'same-unit', unitName: asset.name });
    }
  });

  return held;
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

/** The kit on this finding worth carrying onto the job. */
function issueDetails(issue: RankedIssue) {
  return usableDetails(effectiveDetails(issue.item, issue.answer));
}

/**
 * What the technician has to go and find. The unit is known whenever the
 * question records it or the inspector typed it in — a serial number beats a
 * category title every time — so those values name the job, and the section
 * title is the fallback for a finding where nobody said which unit.
 */
function equipmentFor(issue: RankedIssue, sectionTitle: string | null): string {
  const details = issueDetails(issue);
  if (details.length > 0) return details.map((d) => d.value.trim()).join(' · ');
  return sectionTitle ?? 'Reported by inspection';
}

/** The issues on an inspection that belong on the maintenance board. */
export function maintenanceIssues(issues: RankedIssue[]): RankedIssue[] {
  return issues.filter((issue) => needsMaintenance(issue.item, issue.answer));
}

/** What the inspector said was wrong, as one readable paragraph. */
function detailsFor(issue: RankedIssue, sectionTitle: string | null): string {
  const { answer } = issue;
  const reason =
    answer.reason === 'Other' ? answer.otherReason?.trim() || 'Other' : answer.reason;

  const kit = issueDetails(issue)
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
  /** Jobs taken off the board because their finding is no longer repair work. */
  withdrawn: number;
}

/**
 * Brings the maintenance board in line with this inspection: a job for every
 * failure marked as repair work that has not got one, and none left over for
 * failures no longer marked that way.
 *
 * Safe to call more than once for the same inspection: a finding that already
 * raised a job is skipped, so amending and re-submitting a record does not
 * duplicate work, and a job someone has already started is neither rewritten
 * nor withdrawn — from the moment work begins the job belongs to the person
 * doing it, not to the record that asked for it.
 */
export function raiseMaintenanceJobs(
  inspection: Inspection,
  issues: RankedIssue[],
  checklist: ChecklistView
): IntakeResult {
  const candidates = maintenanceIssues(issues);
  const onBoard = getJobs();
  const wanted = new Set(candidates.map((issue) => jobIdFor(inspection.id, issue.item.id)));

  /*
   * Work this inspection asked for and has since stopped asking for, because
   * the answer was changed or the repair mark taken off. Left in place, an
   * amended record would keep sending a technician after something it no
   * longer says is broken.
   */
  let withdrawn = 0;
  onBoard.forEach((job) => {
    if (job.sourceInspectionId !== inspection.id) return;
    if (wanted.has(job.id)) return;
    if (job.startedAt || job.completedAt) return;
    deleteJob(job.id);
    withdrawn += 1;
  });

  if (candidates.length === 0) return { raised: [], alreadyRaised: 0, withdrawn };

  const existing = new Set(onBoard.map((job) => job.id));
  const reportedAt = inspection.submittedAt ?? new Date().toISOString();

  const raised: MaintenanceJob[] = [];
  let alreadyRaised = 0;
  const atBranch = activeEquipment().filter((e) => e.branchName === inspection.branchName);

  candidates.forEach((issue) => {
    const id = jobIdFor(inspection.id, issue.item.id);
    if (existing.has(id)) {
      alreadyRaised += 1;
      return;
    }

    const section = checklist.getSectionOf(issue.item.id);
    /*
     * The asset the finding names, when the inspector picked one off the
     * register. This is what makes a fault reported on the round and the
     * register's own history the same thing rather than two lists that happen
     * to use the same words.
     */
    const asset = assetForCheck(issue.item, issue.answer, atBranch);
    const job: MaintenanceJob = {
      id,
      branchName: inspection.branchName,
      title: issue.item.text,
      details: detailsFor(issue, section?.title ?? null),
      equipment: equipmentFor(issue, section?.title ?? null),
      ...(asset ? { equipmentId: asset.id } : {}),
      category: suggestCategory(issue.item, issue.answer),
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

  return { raised, alreadyRaised, withdrawn };
}
