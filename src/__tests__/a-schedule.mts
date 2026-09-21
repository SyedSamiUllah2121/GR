import { freshBrowser, check, ok, note, section, report } from './harness.mts';
freshBrowser();

const { getEquipment } = await import('../services/equipmentStore.ts');
const { getPlans } = await import('../services/maintenancePlanStore.ts');
const { getJobs } = await import('../services/maintenanceStore.ts');
const { sweepSchedule, upcomingServices, nextDueFor, anchorFor } =
  await import('../services/maintenanceSchedule.ts');

const TODAY = '2026-09-21';
const equipment = getEquipment();
const plans = getPlans();
const acGeneral = plans.find(p => p.id === 'plan-ac_ventilation-general-maintenance')!;

section('the board starts empty — nobody has raised anything');
sweepSchedule(new Date(`${TODAY}T09:00:00`));
check('no jobs on first open', getJobs().length, 0);
check('nothing overdue on first open',
  upcomingServices(TODAY, plans, equipment, getJobs()).filter(s => s.daysOverdue >= 0).length, 0);

section("the register's own flags are recorded, but do not create work");
check('assets stamped SERVICE DUE', equipment.filter(e => e.serviceStatus === 'due').length, 33);
check('assets stamped pending', equipment.filter(e => e.serviceStatus === 'pending').length, 3);
check('assets stamped NOT WORKING', equipment.filter(e => e.serviceStatus === 'faulty').length, 2);
check('none of them raised a job', getJobs().length, 0);
ok('a SERVICE DUE asset keeps its wording for the register screen',
   equipment.find(e => e.assetNo === 'NHB-ACU-003')!.statusNote === 'SERVICE DUE');

section('services fall due on this app\'s own clock');
const serviced = equipment.find(e => e.assetNo === 'NHB-ACU-001')!;  // serviced 12 Aug
check('anchored on the real service date',
  anchorFor(acGeneral, serviced, [], TODAY), '2026-08-12');
check('next due 45 days after it', nextDueFor(acGeneral, serviced, [], TODAY)?.dueOn, '2026-09-26');

const flagged = equipment.find(e => e.assetNo === 'NHB-ACU-003')!;  // SERVICE DUE, no date
check('a flagged asset counts from when it was recorded',
  anchorFor(acGeneral, flagged, [], TODAY), '2026-09-17');
check('and is not overdue today', nextDueFor(acGeneral, flagged, [], TODAY)?.daysOverdue, -41);

section('the board fills as work genuinely comes round');
const seen: number[] = [];
for (const d of ['2026-09-26', '2026-10-15', '2026-11-01']) {
  sweepSchedule(new Date(`${d}T09:00:00`));
  seen.push(getJobs().length);
}
note('board at 26 Sep / 15 Oct / 1 Nov', seen);
ok('it grows rather than arriving all at once', seen[0] > 0 && seen[0] < seen[1] && seen[1] < seen[2]);
ok('every job is a scheduled service, none invented as a problem',
   getJobs().every(j => j.kind === 'scheduled'));
ok('nobody is credited with reporting them',
   getJobs().every(j => j.reportedBy === 'Maintenance schedule'));

section('every job says which machine, so a board of Split ACs is readable');
const titles = getJobs().map(j => j.title);
check('no two jobs share a title', new Set(titles).size, titles.length);
ok('each title leads with its asset number',
   getJobs().every(j => j.title.startsWith(getEquipment().find(e => e.id === j.equipmentId)!.assetNo!)));

section('idempotence — the sweep runs on every app open');
const before = getJobs().length;
sweepSchedule(new Date('2026-11-01T14:00:00'));
sweepSchedule(new Date('2026-11-01T18:00:00'));
check('three sweeps raise one board, not three', getJobs().length, before);
check('no job raised twice', new Set(getJobs().map(j => j.id)).size, before);

process.exit(report());
