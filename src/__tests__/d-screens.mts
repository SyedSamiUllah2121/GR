import { freshBrowser, check, ok, note, section, report } from './harness.mts';
freshBrowser();

const { getEquipment, equipmentAt } = await import('../services/equipmentStore.ts');
const { getBranches } = await import('../services/branchStore.ts');
const { getUsers } = await import('../services/userStore.ts');
const { getJobs } = await import('../services/maintenanceStore.ts');
const { sweepSchedule } = await import('../services/maintenanceSchedule.ts');
const { buildBoard, buildMonthlyReport, availableMonths, buildRepeats, buildMaintenanceOverview } =
  await import('../services/maintenanceReport.ts');
const { canAccessPath, homePathFor, canManageJobs, maintenanceBranchesFor, visibleJobs } =
  await import('../services/permissions.ts');
const { generalMaintenanceState } = await import('../services/generalMaintenance.ts');
const { activePlans } = await import('../services/maintenancePlanStore.ts');

sweepSchedule(new Date('2026-09-21T09:00:00'));
const jobs = getJobs(), equipment = getEquipment(), branches = getBranches(), users = getUsers();
/* A board once work has genuinely come round, for the screens that need one. */
sweepSchedule(new Date('2026-11-01T09:00:00'));
const laterJobs = getJobs();

section('the job board on first open');
const board = buildBoard(laterJobs);
note('reported', board.reported?.length ?? '—');
note('in progress', board.inProgress?.length ?? '—');
note('completed', board.completed?.length ?? '—');
note('jobs once services have come round', laterJobs.length);
check('every job names a real branch',
  laterJobs.filter(j => !branches.some(b => b.name === j.branchName)).length, 0);
check('every job names a live asset',
  laterJobs.filter(j => j.equipmentId && !equipment.some(e => e.id === j.equipmentId)).length, 0);
check('every job names a live trade',
  laterJobs.filter(j => !['AC_VENTILATION','REFRIGERATION','ELECTRICAL','OTHER'].includes(j.category)).length, 0);

section('the register flags stay on the register, not the board');
for (const b of branches) {
  const jobsHere = jobs.filter(j => j.branchName === b.name).length;
  const flagged = equipment.filter(e => e.branchName === b.name &&
    ['due','pending','faulty'].includes(e.serviceStatus ?? '')).length;
  console.log(`ok    ${b.name.padEnd(34)} board ${String(jobsHere).padStart(3)}   register flags ${String(flagged).padStart(3)}`);
}
check('nothing on the board on day one', jobs.length, 0);
check('but the flags are recorded', 
  equipment.filter(e => ['due','pending','faulty'].includes(e.serviceStatus ?? '')).length, 38);

section('month-end report');
const months = availableMonths(laterJobs);
note('months with activity', months);
const rep = buildMonthlyReport(laterJobs, months[0] ?? '2026-11');
ok('report builds without throwing', !!rep);
note('rows', (rep as any).branches?.length ?? Object.keys(rep).length);

section('repeat offenders');
const repeats = buildRepeats(laterJobs);
ok('repeats build', Array.isArray(repeats));
check('no repeat offenders on day one', repeats.length, 0);

section('overview');
const overview = buildMaintenanceOverview(laterJobs, new Date('2026-11-01T09:00:00'));
ok('overview builds', !!overview);
note('open jobs', overview.open?.length ?? (overview as any).openCount ?? '—');
ok('overview reports without throwing', Array.isArray(overview.ageing));

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
/*
 * The board reads for the branch, and moves for maintenance. A branch manager
 * and an inspector reach every page of the module — they raise the faults on
 * it — and none of the buttons that mark work done.
 */
ok('inspector reaches the board', canAccessPath(insp, '/maintenance/jobs'));
ok('inspector reaches the overview', canAccessPath(insp, '/maintenance'));
ok('branch manager reaches the month-end report', canAccessPath(bm, '/maintenance/report'));
ok('inspector cannot move a job along', !canManageJobs(insp));
ok('branch manager cannot move a job along', !canManageJobs(bm));
ok('maintenance manager can', canManageJobs(jm));

/* And each of them reads their own branches on it, not the estate. */
check('branch manager sees one branch', maintenanceBranchesFor(bm)?.length, 1);
ok('maintenance manager sees every branch', maintenanceBranchesFor(jm) === null);
ok(
  "inspector sees only branches they were sent to",
  visibleJobs(insp, laterJobs).every((j: { branchName: string }) =>
    (maintenanceBranchesFor(insp) ?? []).includes(j.branchName)
  )
);
check(
  'a branch manager\'s board is their own branch',
  visibleJobs(bm, laterJobs).every((j: { branchName: string }) => j.branchName === bm.branchName),
  true
);
ok('admin reaches everything', ['/users','/maintenance/jobs','/inspections','/checklist']
  .every(p => canAccessPath(admin, p)));
ok('every branch manager has a home', users.filter(u=>u.role==='branch-manager')
  .every(u => !!homePathFor(u)));

section('general maintenance state resolves for every asset');
const plans = activePlans();
let broke = 0;
for (const e of equipment) { try { generalMaintenanceState(e, '2026-11-01', plans, laterJobs); } catch { broke++; } }
check('no asset throws', broke, 0);

process.exit(report());
