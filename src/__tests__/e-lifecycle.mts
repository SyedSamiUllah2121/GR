import { freshBrowser, check, ok, note, section, report } from './harness.mts';
freshBrowser();

const { getEquipment, getEquipmentById } = await import('../services/equipmentStore.ts');
const { getJobs, saveJob, completeJob, startJob } = await import('../services/maintenanceStore.ts');
const { sweepSchedule, nextDueFor } = await import('../services/maintenanceSchedule.ts');
const { activePlans } = await import('../services/maintenancePlanStore.ts');

sweepSchedule(new Date('2026-09-21T09:00:00'));

section('a due AC, serviced — the register must stop saying DUE');
const before = getEquipment().find(e => e.assetNo === 'NHB-ACU-003')!;
check('starts as the document says', before.serviceStatus, 'due');
check('with the document wording', before.statusNote, 'SERVICE DUE');

let job = getJobs().find(j => j.equipmentId === before.id && j.kind === 'scheduled')!;
ok('a job was raised for it', !!job);
job = { ...job, startedAt: '2026-09-22T09:00:00.000Z' };
saveJob(job);
const { job: done, error } = completeJob(job, {
  attendedBy: 'Cool Air Services', resolutionNote: 'Filters washed, gas checked.',
  cost: 180, photos: [],
});
check('closed without error', error, undefined);

// what the dialog does next
const { reconcileServiceStatus } = await import('../services/equipmentStore.ts');
reconcileServiceStatus(done!.equipmentId, done!.completedAt!, done!.kind ?? 'scheduled');

const after = getEquipmentById(before.id)!;
check('status now reads serviced', after.serviceStatus, 'serviced');
// completeJob stamps the real clock, so the expectation is read off the job
const doneDay = done!.completedAt!.slice(0, 10);
check('dated the day the work was recorded', after.lastServicedOn, doneDay);
ok('worded the way the register words it', /^Serviced \d{1,2} [A-Z][a-z]{2} \d{4}$/.test(after.statusNote!));
note('the wording written', after.statusNote);
const nd = nextDueFor(activePlans().find(p=>p.id==='plan-ac_ventilation-general-maintenance')!,
                      after, getJobs(), doneDay);
// UTC throughout, or toISOString silently shifts the answer by a day
const expected = new Date(`${doneDay}T00:00:00Z`);
expected.setUTCDate(expected.getUTCDate() + 45);
check('next service counted 45 days from the work', nd?.dueOn, expected.toISOString().slice(0,10));
ok('no longer overdue', (nd?.daysOverdue ?? 0) < 0);

section('a dead unit, repaired — it must stop claiming to be broken');
const broken = getEquipment().find(e => e.assetNo === 'DGR-ACU-031')!;
check('starts faulty', broken.serviceStatus, 'faulty');
let fix = getJobs().find(j => j.equipmentId === broken.id && j.kind === 'problem')!;
ok('a repair job was raised', !!fix);
check('raised as a repair, not a service', fix.kind, 'problem');
fix = { ...fix, startedAt: '2026-09-23T09:00:00.000Z' };
saveJob(fix);
const { job: fixed } = completeJob(fix, {
  attendedBy: 'Cool Air Services', resolutionNote: 'Compressor replaced.', cost: 1400, photos: [],
});
reconcileServiceStatus(fixed!.equipmentId, fixed!.completedAt!, fixed!.kind ?? 'problem');
const repaired = getEquipmentById(broken.id)!;
check('no longer faulty', repaired.serviceStatus, 'inventory');
check('and does not claim a service happened', repaired.lastServicedOn, null);
ok('worded honestly', /^Repaired \d{1,2} [A-Z][a-z]{2} \d{4}$/.test(repaired.statusNote!));
note('the wording written', repaired.statusNote);

section('a repaired unit is not re-raised on the next sweep');
const n1 = getJobs().length;
sweepSchedule(new Date('2026-09-24T09:00:00'));
check('no duplicate repair job', getJobs().filter(j => j.equipmentId === broken.id && j.kind==='problem').length, 1);
note('board after', getJobs().length);

section('an inventory asset is untouched by a repair elsewhere');
const fridge = getEquipment().find(e => e.assetNo === 'NHB-CHL-001')!;
check('still on inventory', fridge.serviceStatus, 'inventory');
check('still carries its own note', fridge.statusNote, 'Inventory');

process.exit(report());
