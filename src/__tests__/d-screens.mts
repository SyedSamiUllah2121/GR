import { freshBrowser, check, ok, note, section, report } from './harness.mts';
freshBrowser();

const { getEquipment, equipmentAt } = await import('../services/equipmentStore.ts');
const { getBranches } = await import('../services/branchStore.ts');
const { getUsers } = await import('../services/userStore.ts');
const { getJobs } = await import('../services/maintenanceStore.ts');
const { sweepSchedule } = await import('../services/maintenanceSchedule.ts');
const { buildBoard, buildMonthlyReport, availableMonths, buildRepeats, buildMaintenanceOverview } =
  await import('../services/maintenanceReport.ts');
const { canAccessPath, homePathFor } = await import('../services/permissions.ts');
const { generalMaintenanceState } = await import('../services/generalMaintenance.ts');
const { activePlans } = await import('../services/maintenancePlanStore.ts');

sweepSchedule(new Date('2026-09-21T09:00:00'));
const jobs = getJobs(), equipment = getEquipment(), branches = getBranches(), users = getUsers();

section('the job board on first open');
const board = buildBoard(jobs);
note('reported', board.reported?.length ?? '—');
note('in progress', board.inProgress?.length ?? '—');
note('completed', board.completed?.length ?? '—');
check('every job names a real branch',
  jobs.filter(j => !branches.some(b => b.name === j.branchName)).length, 0);
check('every job names a live asset',
  jobs.filter(j => j.equipmentId && !equipment.some(e => e.id === j.equipmentId)).length, 0);
check('every job names a live trade',
  jobs.filter(j => !['AC_VENTILATION','REFRIGERATION','ELECTRICAL','OTHER'].includes(j.category)).length, 0);

section('jobs per branch — the work is spread as the register says');
for (const b of branches) {
  const n = jobs.filter(j => j.branchName === b.name).length;
  const dueHere = equipment.filter(e => e.branchName === b.name &&
    (e.serviceStatus === 'due' || e.serviceStatus === 'pending' || e.serviceStatus === 'faulty')).length;
  const okRow = n === dueHere;
  console.log(`${okRow?'ok  ':'FAIL'}  ${b.name.padEnd(34)} jobs ${String(n).padStart(3)}  register flags ${String(dueHere).padStart(3)}`);
  if (!okRow) check(`${b.name} jobs match flags`, n, dueHere);
}
check('board total matches the register flags', jobs.length,
  equipment.filter(e=>['due','pending','faulty'].includes(e.serviceStatus ?? '')).length);

section('month-end report');
const months = availableMonths(jobs);
note('months with activity', months);
const rep = buildMonthlyReport(jobs, months[0] ?? '2026-09');
ok('report builds without throwing', !!rep);
note('rows', (rep as any).branches?.length ?? Object.keys(rep).length);

section('repeat offenders');
const repeats = buildRepeats(jobs);
ok('repeats build', Array.isArray(repeats));
check('no repeat offenders on day one', repeats.length, 0);

section('overview');
const overview = buildMaintenanceOverview(jobs, new Date('2026-09-21T09:00:00'));
ok('overview builds', !!overview);
note('open jobs', overview.open?.length ?? (overview as any).openCount ?? '—');
ok('nothing ageing on day one', (overview.ageing?.length ?? 0) === 0);

section('per-branch register scoping');
for (const b of branches) {
  const n = equipmentAt(b.name).length;
  if (n === 0) check(`${b.name} has assets`, n, '>0');
}
check('every branch has assets', branches.every(b => equipmentAt(b.name).length > 0), true);
check('assets across branches sum to the register', 
  branches.reduce((n,b) => n + equipmentAt(b.name).length, 0), 302);

section('permissions with nine branches');
const bm = users.find(u => u.role === 'branch-manager')!;
const admin = users.find(u => u.role === 'admin')!;
const jm = users.find(u => u.role === 'job-manager')!;
const insp = users.find(u => u.role === 'inspector')!;
ok('branch manager reaches the register', canAccessPath(bm, '/maintenance/equipment'));
ok('branch manager blocked from users', !canAccessPath(bm, '/users'));
ok('maintenance manager reaches the board', canAccessPath(jm, '/maintenance/jobs'));
ok('maintenance manager blocked from inspections', !canAccessPath(jm, '/inspections'));
ok('inspector blocked from the board', !canAccessPath(insp, '/maintenance/jobs'));
ok('admin reaches everything', ['/users','/maintenance/jobs','/inspections','/checklist']
  .every(p => canAccessPath(admin, p)));
ok('every branch manager has a home', users.filter(u=>u.role==='branch-manager')
  .every(u => !!homePathFor(u)));

section('general maintenance state resolves for every asset');
const plans = activePlans();
let broke = 0;
for (const e of equipment) { try { generalMaintenanceState(e, '2026-09-21', plans, jobs); } catch { broke++; } }
check('no asset throws', broke, 0);

process.exit(report());
