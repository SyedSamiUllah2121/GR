/**
 * Handing an inspection in when maintenance already holds part of it.
 *
 * A check whose fault is on the board has its buttons locked, so the visit can
 * never be given an answer for it. Everything downstream has to agree about
 * that: the submit gate, the score, the report, and what re-submitting does to
 * the board. When they disagreed, an inspection could be filled in completely
 * and then never handed in.
 */
import { freshBrowser, check, ok, note, section, report } from './harness.mts';
freshBrowser();

const { saveJob, getJobs, statusOf } = await import('../services/maintenanceStore.ts');
const { heldChecks, raiseMaintenanceJobs, jobIdFor, needsMaintenance } = await import(
  '../services/maintenanceIntake.ts'
);
const { getChecklist, buildSections, buildView } = await import('../services/checklistStore.ts');
const { getBranches } = await import('../services/branchStore.ts');
const { buildReportModel } = await import('../services/reportModel.ts');
const { computePriority, EMPTY_HISTORY } = await import('../services/priority.ts');

const doc = getChecklist();
const checklist = buildView(doc);
const items = buildSections(doc).flatMap((s: any) => s.items);
const branch = getBranches()[0].name;
const broken = items[5];

const YES = { status: 'yes', reason: null, otherReason: null, note: null, photo: null };

/** What the two screens agree counts as answerable, and what the visit scores. */
function reviewGate(inspectionId: string, answers: Record<number, any>) {
  const held = heldChecks(branch, items, answers, getJobs(), undefined, inspectionId);
  const heldItems = items.filter((i: any) => held.has(i.id));
  const rest = items.filter((i: any) => !held.has(i.id));
  const unanswered = rest.filter((i: any) => {
    const s = answers[i.id]?.status;
    return s !== 'yes' && s !== 'no';
  });
  const yes = rest.filter((i: any) => answers[i.id]?.status === 'yes').length;
  const scored = items.length - heldItems.length;
  return {
    heldItems,
    unanswered,
    canSubmit: unanswered.length === 0,
    score: scored > 0 ? Math.round((yes / scored) * 100) : 0,
    scored,
  };
}

section('a fault already on the board holds its check');
saveJob({
  id: 'mnt-insp-earlier-' + broken.id,
  branchName: branch,
  title: broken.text ?? 'Broken',
  details: '',
  equipment: '',
  category: 'general',
  priority: 'high',
  reportedBy: 'An earlier visit',
  reportedAt: '2026-09-01T09:00:00.000Z',
  startedAt: null,
  completedAt: null,
  attendedBy: null,
  resolutionNote: null,
  cost: null,
  photo: null,
  sourceInspectionId: 'insp-earlier',
  sourceItemId: broken.id,
} as any);

const heldNow = heldChecks(branch, items, {}, getJobs(), undefined, 'insp-new');
check('one check is held', heldNow.size, 1);
ok('and it is the one the job names', heldNow.has(broken.id));

section('the visit can be handed in without it');
/* Every check the screen will let an inspector answer, answered. */
const answers: Record<number, any> = {};
items.forEach((i: any) => {
  if (!heldNow.has(i.id)) answers[i.id] = { ...YES };
});
const gate = reviewGate('insp-new', answers);
check('nothing is left unanswered', gate.unanswered.length, 0);
ok('so submit is not refused', gate.canSubmit);
note('held', gate.heldItems.length);

section('and it is scored out of what it could actually judge');
check('marked out of the answerable checks', gate.scored, items.length - 1);
check('a clean round scores 100', gate.score, 100);

section('the report agrees with the score it was signed with');
const record: any = {
  id: 'insp-new',
  branchName: branch,
  date: '2026-09-22',
  time: '9:00 am',
  status: 'submitted',
  score: gate.score,
  signature: null,
  answers,
  currentSectionIndex: 0,
  inspectorName: 'An inspector',
  itemIds: items.map((i: any) => i.id),
  heldItemIds: gate.heldItems.map((i: any) => i.id),
};
const model = buildReportModel(record, checklist, [record]);
check('scored rows exclude the held one', model.total, items.length - 1);
check('the held one is counted as held', model.held, 1);
check('and not as unanswered', model.unanswered, 0);
check('the live score matches the signed one', model.liveScore, record.score);
ok('so no mismatch is flagged at the reader', !model.scoreMismatch);
check(
  'the report still prints the held check',
  model.rows.filter((r: any) => r.outcome === 'held').length,
  1
);

section('a visit is not held up by the work it raised itself');
/*
 * Re-submitting an amended record used to drop its own findings: each was
 * held by the job it had raised, so it left the flagged list, which withdrew
 * the job, which unheld the check, which raised it again next time.
 */
/*
 * Marked No against the maintenance group, which is what sends a finding to
 * the board — no check is authored as repair work, the inspector says so.
 */
const ownAnswer = {
  status: 'no',
  reason: 'Broken',
  otherReason: null,
  note: null,
  photo: null,
  reasonGroup: 'MAINTENANCE',
};
const own = items.find((i: any) => i.id !== broken.id)!;
ok('the finding is repair work', needsMaintenance(own, ownAnswer as any));
const amended: any = { ...record, id: 'insp-amended', answers: { ...answers, [own.id]: ownAnswer } };
const ownJobId = jobIdFor(amended.id, own.id);
saveJob({
  id: ownJobId,
  branchName: branch,
  title: own.text ?? 'Its own finding',
  details: '',
  equipment: '',
  category: 'general',
  priority: 'high',
  reportedBy: 'This visit',
  reportedAt: '2026-09-22T09:00:00.000Z',
  startedAt: null,
  completedAt: null,
  attendedBy: null,
  resolutionNote: null,
  cost: null,
  photo: null,
  sourceInspectionId: amended.id,
  sourceItemId: own.id,
} as any);

const heldOnAmend = heldChecks(branch, items, amended.answers, getJobs(), undefined, amended.id);
ok('its own finding is not held against it', !heldOnAmend.has(own.id));
ok('another visit\'s job still holds its check', heldOnAmend.has(broken.id));

/* So re-submitting keeps asserting the finding, and the job stays put. */
const issues = [
  { item: own, answer: ownAnswer, priority: computePriority(own, ownAnswer, EMPTY_HISTORY) },
];
const result = raiseMaintenanceJobs(amended, issues as any, checklist);
check('nothing was withdrawn', result.withdrawn, 0);
ok(
  'the job it raised is still on the board',
  getJobs().some((j: any) => j.id === ownJobId && statusOf(j) !== 'completed')
);

section('once the repair is done the check comes back');
const done = getJobs().find((j: any) => j.id === 'mnt-insp-earlier-' + broken.id)!;
saveJob({ ...done, startedAt: '2026-09-23T08:00:00.000Z', completedAt: '2026-09-23T10:00:00.000Z' });
const afterRepair = heldChecks(branch, items, {}, getJobs(), undefined, 'insp-later');
ok('nothing is held any more', !afterRepair.has(broken.id));

process.exit(report());
