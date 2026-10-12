/**
 * Moving an asset to another branch.
 *
 * The unit keeps its record — the same id, so its service history follows —
 * and is listed under the new branch from then on. Two moves are refused: one
 * while a job on it is still open, because that job sends somebody to the
 * old kitchen, and one that would put a second untagged unit of the same name
 * in a kitchen, because nothing could tell the two apart.
 */
import { freshBrowser, check, ok, note, section, report } from './harness.mts';
freshBrowser();

const { getEquipment, updateEquipment, addEquipment } = await import('../services/equipmentStore.ts');
const { saveJob, getJobs } = await import('../services/maintenanceStore.ts');

const draftOf = (e: any) => ({ ...e, branchName: e.branchName });

const totalBefore = getEquipment().length;
const all = getEquipment().filter((e) => e.active);
const branches = Array.from(new Set(all.map((e) => e.branchName)));
ok('the register has more than one branch to move between', branches.length > 1);

const openOn = new Set(
  getJobs().filter((j) => j.equipmentId && !j.completedAt).map((j) => j.equipmentId)
);
const unit = all.find((e) => e.assetNo && !openOn.has(e.id))!;
const to = branches.find((b) => b !== unit.branchName)!;
note('moving', { id: unit.id, from: unit.branchName, to });

section('a unit with no open job moves, and keeps its record');
const moved = updateEquipment(unit.id, { ...draftOf(unit), branchName: to });
ok('the move is accepted', moved.ok);
const after = getEquipment().find((e) => e.id === unit.id)!;
check('it is listed under the new branch', after.branchName, to);
check('it keeps its id, so its history follows it', after.id, unit.id);
check('it keeps its asset number', after.assetNo, unit.assetNo);
check('no record was added or lost', getEquipment().length, totalBefore);

section('an edit that does not touch the branch leaves it alone');
const corrected = updateEquipment(unit.id, { ...draftOf(after), branchName: '', make: 'Corrected' });
ok('a blank branch in the draft is not a move to nowhere', corrected.ok);
check('still at the branch it was moved to', getEquipment().find((e) => e.id === unit.id)!.branchName, to);

section('a unit with an open job is refused, and says why');
const busy = all.find((e) => e.id !== unit.id && e.assetNo)!;
saveJob({
  id: 'job-open-on-busy',
  branchName: busy.branchName,
  title: 'Not cooling',
  details: '',
  equipment: busy.name,
  category: busy.category,
  priority: 'medium',
  reportedBy: 'Test',
  reportedAt: '2026-10-12T08:00:00.000Z',
  startedAt: null,
  completedAt: null,
  attendedBy: null,
  resolutionNote: null,
  cost: null,
  photo: null,
  equipmentId: busy.id,
} as any);
const elsewhere = branches.find((b) => b !== busy.branchName)!;
const refused = updateEquipment(busy.id, { ...draftOf(busy), branchName: elsewhere });
ok('the move is refused', !refused.ok);
ok('the refusal names the open job', (refused.error ?? '').includes('Not cooling'));
check('it stays where it was', getEquipment().find((e) => e.id === busy.id)!.branchName, busy.branchName);
ok(
  'the same unit can still be corrected without moving it',
  updateEquipment(busy.id, { ...draftOf(busy), make: 'Still fine' }).ok
);

section('an untagged unit cannot land next to one with the same name');
const [a, b] = [branches[0], branches[1]];
const base = { name: 'Test Fryer', category: busy.category, assetNo: null } as any;
ok('an untagged fryer at the first branch', addEquipment({ ...base, branchName: a }, '2026-10-12T08:00:00.000Z').ok);
const second = addEquipment({ ...base, branchName: b }, '2026-10-12T08:00:00.000Z');
ok('an untagged fryer at the second branch', second.ok);
const clash = updateEquipment(second.equipment!.id, { ...base, branchName: a });
ok('moving the second one in beside the first is refused', !clash.ok);
note('refusal', clash.error);
ok('the refusal says to give it an asset number', (clash.error ?? '').includes('asset number'));

process.exit(report());
