import { freshBrowser, check, ok, note, section, report } from './harness.mts';
freshBrowser();

const { getEquipment } = await import('../services/equipmentStore.ts');
const { getPlans } = await import('../services/maintenancePlanStore.ts');
const { getJobs } = await import('../services/maintenanceStore.ts');
const { sweepSchedule, upcomingServices, nextDueFor, anchorFor, toIsoDay } =
  await import('../services/maintenanceSchedule.ts');

const TODAY = '2026-09-21';
const equipment = getEquipment();
const plans = getPlans();

section('what the register says vs what the board raises');

const due = equipment.filter(e => e.serviceStatus === 'due');
const pending = equipment.filter(e => e.serviceStatus === 'pending');
const faulty = equipment.filter(e => e.serviceStatus === 'faulty');
note('register says SERVICE DUE', due.length);
note('register says pending', pending.length);
note('register says NOT WORKING', faulty.length);

const services = upcomingServices(TODAY, plans, equipment, getJobs());
const overdue = services.filter(s => s.daysOverdue >= 0);
note('schedule says overdue today', overdue.length);

const sweep = sweepSchedule(new Date(`${TODAY}T09:00:00`));
note('jobs the sweep would raise today', sweep.raised?.length ?? sweep);

section('anchors');
const sampleDue = due.find(e => e.assetNo === 'NHB-ACU-003')!;
note('NHB-ACU-003 (SERVICE DUE) anchor', anchorFor(plans.find(p=>p.id==='plan-ac_ventilation-general-maintenance')!, sampleDue, [], TODAY));
note('NHB-ACU-003 next due', nextDueFor(plans.find(p=>p.id==='plan-ac_ventilation-general-maintenance')!, sampleDue, [], TODAY));

const sampleServiced = equipment.find(e => e.assetNo === 'NHB-ACU-001')!;
note('NHB-ACU-001 (serviced 12 Aug) anchor', anchorFor(plans.find(p=>p.id==='plan-ac_ventilation-general-maintenance')!, sampleServiced, [], TODAY));
note('NHB-ACU-001 next due', nextDueFor(plans.find(p=>p.id==='plan-ac_ventilation-general-maintenance')!, sampleServiced, [], TODAY));

const sampleFaulty = equipment.find(e => e.assetNo === 'DGR-ACU-031')!;
const board = getJobs();
note('DGR-ACU-031 has a repair job', board.some(j => j.equipmentId === sampleFaulty.id && j.kind === 'problem'));

section('the gap');
ok('every asset the register calls DUE is overdue on the board',
   due.every(e => overdue.some(s => s.equipment.id === e.id)));
ok('every NOT WORKING asset has a repair job on the board',
   faulty.every(e => board.some(j => j.equipmentId === e.id && j.kind === 'problem')));
ok('faults are problems, not services',
   board.filter(j => j.reportedBy === 'Asset register').every(j => j.kind === 'problem'));
check('total jobs on the board after first open', board.length, 38);
check('  of which scheduled services', board.filter(j=>j.kind==='scheduled').length, 36);
check('  of which repairs', board.filter(j=>j.kind==='problem').length, 2);

section('idempotence — the sweep runs on every app open');
const before = getJobs().length;
sweepSchedule(new Date(`${TODAY}T14:00:00`));
sweepSchedule(new Date(`${TODAY}T18:00:00`));
check('three sweeps raise the same board, not three boards', getJobs().length, before);

report();
