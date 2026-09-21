import { freshBrowser, check, ok, note, section, report } from './harness.mts';
freshBrowser();

const { getEquipment, getEquipmentById } = await import('../services/equipmentStore.ts');
const { getJobs, saveJob, completeJob, startJob } = await import('../services/maintenanceStore.ts');
const { sweepSchedule, nextDueFor } = await import('../services/maintenanceSchedule.ts');
const { activePlans } = await import('../services/maintenancePlanStore.ts');

// Swept to a day the routine service has genuinely come round. Nothing is
// raised on day one any more — the register's flags are recorded, not acted on.
sweepSchedule(new Date('2026-09-26T09:00:00'));

section('a service falling due, carried out — the register keeps up');
const before = getEquipment().find(e => e.assetNo === 'NHB-ACU-001')!;
check('starts as the document says', before.serviceStatus, 'serviced');
check('with the document wording', before.statusNote, 'Serviced 12 Aug 2026');

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

section('a dead unit, reported by a person and repaired');
const broken = getEquipment().find(e => e.assetNo === 'DGR-ACU-031')!;
check('the register records it as faulty', broken.serviceStatus, 'faulty');
check('but nothing raised a job for it',
  getJobs().filter(j => j.equipmentId === broken.id && j.kind === 'problem').length, 0);

// what "Report a problem" does
let fix = {
  id: `mnt-${broken.id}-reported`, branchName: broken.branchName,
  title: `${broken.assetNo} — not cooling`, details: 'Reported by the branch.',
  equipment: broken.name, category: broken.category, priority: 'high' as const,
  reportedBy: 'Adeel Nawaz', reportedAt: '2026-09-26T08:00:00.000Z',
  startedAt: null, completedAt: null, attendedBy: null, resolutionNote: null,
  cost: null, photo: null, kind: 'problem' as const, equipmentId: broken.id,
};
saveJob(fix);
check('now there is one, raised by a person', 
  getJobs().filter(j => j.equipmentId === broken.id && j.kind === 'problem').length, 1);
check('credited to the person, not the register', 
  getJobs().find(j => j.id === fix.id)!.reportedBy, 'Adeel Nawaz');

fix = { ...fix, startedAt: '2026-09-26T09:00:00.000Z' };
saveJob(fix);
const { job: fixed } = completeJob(fix as any, {
  attendedBy: 'Cool Air Services', resolutionNote: 'Compressor replaced.', cost: 1400, photos: [],
});
reconcileServiceStatus(fixed!.equipmentId, fixed!.completedAt!, fixed!.kind ?? 'problem');
const repaired = getEquipmentById(broken.id)!;
check('no longer faulty', repaired.serviceStatus, 'inventory');
check('and does not claim a service happened', repaired.lastServicedOn, null);
ok('worded honestly', /^Repaired \d{1,2} [A-Z][a-z]{2} \d{4}$/.test(repaired.statusNote!));
note('the wording written', repaired.statusNote);

section('a repaired unit is not re-raised by the sweep');
sweepSchedule(new Date('2026-09-27T09:00:00'));
check('still exactly one repair, and the app invented none',
  getJobs().filter(j => j.equipmentId === broken.id && j.kind === 'problem').length, 1);
check('the app raises no problems of its own, ever',
  getJobs().filter(j => j.kind === 'problem' && j.reportedBy === 'Asset register').length, 0);

section('an inventory asset is untouched by a repair elsewhere');
const fridge = getEquipment().find(e => e.assetNo === 'NHB-CHL-001')!;
check('still on inventory', fridge.serviceStatus, 'inventory');
check('still carries its own note', fridge.statusNote, 'Inventory');

process.exit(report());
