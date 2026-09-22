/**
 * An assigned surprise visit is the admin's instruction, not the inspector's
 * to tear up.
 *
 * Starting one turns the assignment into a draft *in place* — same record,
 * same id — so "discard the draft" and "delete the visit the admin raised"
 * were one action, and the inspector had the button. These are the rules that
 * stop that, and the check that stopping it has not left the inspector stuck
 * with a half-finished visit they can neither finish nor put down.
 */
import { freshBrowser, check, ok, note, section, report } from './harness.mts';
freshBrowser();

const { getUsers } = await import('../services/userStore.ts');
const { getBranches } = await import('../services/branchStore.ts');
const { getInspections, getActiveDraft, clearActiveDraft, getInspectionById, saveInspection } =
  await import('../services/storage.ts');
const {
  createSurpriseVisit,
  startAssignment,
  cancelAssignment,
  assignmentsFor,
  outstandingVisitAt,
  outstandingVisitFor,
  randomBranch,
  randomInspector,
} = await import('../services/assignments.ts');
const { saveSetting } = await import('../services/settings.ts');
const { canDiscardDraft, canPerformInspection, canEditInspection, visibleInspections } =
  await import('../services/permissions.ts');

const users = getUsers();
const admin = users.find((u) => u.role === 'admin')!;
const inspector = users.find((u) => u.role === 'inspector')!;
const manager = users.find((u) => u.role === 'branch-manager')!;
const branch = getBranches()[0].name;

section('the admin raises one and it reaches the inspector');
const raised = createSurpriseVisit({
  branchName: branch,
  inspectorId: inspector.id,
  raisedBy: admin,
  now: new Date('2026-09-22T09:00:00'),
});
ok('the visit was raised', raised.ok);
const visit = raised.inspection!;
check('it is waiting to be started', visit.status, 'assigned');
check('it is in the inspector’s list', assignmentsFor(inspector.id).length, 1);
ok('and they may see it', visibleInspections(inspector, getInspections()).some((i) => i.id === visit.id));

section('before they start it');
ok('the inspector may carry it out', canPerformInspection(inspector, visit));
ok('but there is no draft of it to discard', !canDiscardDraft(inspector, visit));

section('once started, the draft IS the assignment');
const started = startAssignment(visit, new Date('2026-09-22T10:00:00'));
check('same record', started.id, visit.id);
check('now a draft', started.status, 'draft');
check('still the same surprise visit', started.kind, 'surprise');

section('and the inspector still may not throw it away');
ok('discarding is refused', !canDiscardDraft(inspector, started));
ok('but filling it in is not', canPerformInspection(inspector, started));
ok('nor is changing their answers', canEditInspection(inspector, started));

section('the admin, who raised it, may withdraw it');
ok('the admin may discard the draft', canDiscardDraft(admin, started));

section('a Monday round is nobody’s instruction, so it may be abandoned');
/*
 * The branch's own weekly round: they started it themselves, so there is no
 * instruction to destroy and Discard stays where it was.
 */
const mondayDraft = {
  ...started,
  id: 'insp-monday-1',
  kind: 'monday',
  branchName: manager.branchName,
  assignedToUserId: undefined,
  status: 'draft',
} as any;
ok('the branch manager may discard their own round', canDiscardDraft(manager, mondayDraft));
ok('an inspector may not — it was never theirs', !canDiscardDraft(inspector, mondayDraft));

section('a submitted record is not a draft, whoever is asking');
ok(
  'the admin cannot discard a signed record here',
  !canDiscardDraft(admin, { ...started, status: 'submitted' } as any)
);

section('and the inspector is not stuck with it');
/*
 * One draft slot. If a started visit blocks the next assignment and cannot be
 * discarded either, the inspector has nowhere to go — so putting it down has
 * to clear the slot without touching the record.
 */
ok('the slot holds the started visit', getActiveDraft()?.id === started.id);
clearActiveDraft();
check('the slot is free for the next assignment', getActiveDraft(), null);
ok('and the visit is still on record', !!getInspectionById(started.id));
check('still at the point they left it', getInspectionById(started.id)?.status, 'draft');
ok(
  'still in their own list to pick up',
  visibleInspections(inspector, getInspections()).some((i) => i.id === started.id)
);

section('one unfinished visit per branch, and per inspector');
/*
 * The rule the client asked for: while a visit is due or under way, neither
 * that branch nor that inspector may be given another. Not a double-click
 * guard — two outstanding visits to one branch are two people about to walk
 * the same floor over the same checklist.
 */
const secondInspector = users.filter((u) => u.role === 'inspector')[1]!;
const freeBranch = getBranches()[2].name;

const sameBranch = createSurpriseVisit({
  branchName: branch,
  inspectorId: secondInspector.id,
  raisedBy: admin,
  now: new Date('2026-09-25T08:00:00'),
});
ok('a second visit to the busy branch is refused', !sameBranch.ok);
note('what it says', sameBranch.error);

const samePerson = createSurpriseVisit({
  branchName: freeBranch,
  inspectorId: inspector.id,
  raisedBy: admin,
  now: new Date('2026-09-25T08:00:00'),
});
ok('and a second visit for the busy inspector is refused', !samePerson.ok);
note('what it says', samePerson.error);

/* A free branch and a free person is still allowed. */
const allowed = createSurpriseVisit({
  branchName: freeBranch,
  inspectorId: secondInspector.id,
  raisedBy: admin,
  now: new Date('2026-09-25T08:00:00'),
});
ok('a free pairing goes through', allowed.ok);

section('the rule holds whichever way the visit was chosen');
/*
 * The draw and the admin's own hand are equally capable of naming a branch
 * that is already busy, and the branch is no less busy for having been typed.
 */
saveSetting('randomAssignment', false);
const byHand = createSurpriseVisit({
  branchName: branch,
  inspectorId: secondInspector.id,
  raisedBy: admin,
  now: new Date('2026-09-25T09:00:00'),
});
ok('still refused with the draw switched off', !byHand.ok);
saveSetting('randomAssignment', true);

section('and the draw never offers one that would be refused');
ok('no busy branch is dealt',
  !outstandingVisitAt(randomBranch()?.name ?? '__none__'));
const drawnInspector = randomInspector();
ok('no busy inspector is drawn',
  drawnInspector === null || !outstandingVisitFor(drawnInspector.id));

section('finishing one frees both');
const blocking = getInspections().find(
  (i) => i.branchName === freeBranch && i.status === 'assigned'
)!;
saveInspection({ ...blocking, status: 'submitted', submittedAt: '2026-09-26T10:00:00.000Z' });
ok('the branch is free again', !outstandingVisitAt(freeBranch));
ok('and so is the inspector', !outstandingVisitFor(secondInspector.id));
const after = createSurpriseVisit({
  branchName: freeBranch,
  inspectorId: secondInspector.id,
  raisedBy: admin,
  now: new Date('2026-09-27T08:00:00'),
});
ok('so the next one may be raised', after.ok);

section('withdrawing is the admin’s, and only while unstarted');
const withdrawn = cancelAssignment(after.inspection!.id);
ok('the admin withdrew it', withdrawn.ok);
ok('and it is gone from the list',
  !assignmentsFor(secondInspector.id).some((i) => i.id === after.inspection!.id));

const refused = cancelAssignment(started.id);
ok('a started visit cannot be withdrawn out from under them', !refused.ok);
note('what it says instead', refused.error);

process.exit(report());
