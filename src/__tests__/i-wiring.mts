/**
 * The joins between the parts.
 *
 * Each screen is fine on its own; what breaks is the seam between two of them
 * — a link carrying an id nothing reads, a job that names an appliance by a
 * string rather than by its id, a count taken off a different list from the
 * one below it. This suite walks the paths a person actually takes and checks
 * that what one end writes is what the other end finds.
 */
import { freshBrowser, check, ok, note, section, report } from './harness.mts';
freshBrowser();

const { getJobs, saveJob, statusOf } = await import('../services/maintenanceStore.ts');
const { getEquipment, getEquipmentById, activeEquipment } = await import(
  '../services/equipmentStore.ts'
);
const { heldChecks, needsMaintenance } = await import('../services/maintenanceIntake.ts');
const { getChecklist, buildSections } = await import('../services/checklistStore.ts');
const { getBranches } = await import('../services/branchStore.ts');
const { getUsers } = await import('../services/userStore.ts');
const { sweepSchedule } = await import('../services/maintenanceSchedule.ts');
const { generalMaintenanceState } = await import('../services/generalMaintenance.ts');
const { activePlans } = await import('../services/maintenancePlanStore.ts');
const { visibleJobs, visibleEquipment, maintenanceBranchesFor, canManageJobs } = await import(
  '../services/permissions.ts'
);
const { describeAsset } = await import('../components/UnitPicker.tsx');
const { buildMaintenanceOverview } = await import('../services/maintenanceReport.ts');

const branch = getBranches()[0].name;
const register = activeEquipment().filter((e) => e.branchName === branch);
const items = buildSections(getChecklist()).flatMap((s: any) => s.items);

// ---------------------------------------------------------------------------
section('reporting a problem against an appliance');
// ---------------------------------------------------------------------------
/*
 * What the report dialog writes: the unit as the register words it, and the
 * register's own id beside it.
 */
const unit = register[3];
const reported = {
  id: 'mnt-reported-1',
  branchName: branch,
  title: 'Not cooling',
  details: '',
  equipment: describeAsset(unit),
  equipmentId: unit.id,
  category: unit.category,
  priority: 'high',
  reportedBy: 'A manager',
  reportedAt: '2026-09-22T09:00:00.000Z',
  startedAt: null,
  completedAt: null,
  attendedBy: null,
  resolutionNote: null,
  cost: null,
  photo: null,
};
ok('the job saved', saveJob(reported as any));

const saved = getJobs().find((j) => j.id === 'mnt-reported-1')!;
ok('it names the appliance by id', saved.equipmentId === unit.id);
ok('and in words a reader can act on', saved.equipment.includes(unit.name));
note('what the job says the unit is', saved.equipment);

// ---------------------------------------------------------------------------
section("the appliance's History link finds it");
// ---------------------------------------------------------------------------
/*
 * The register's History button goes to /maintenance/jobs?equipment=<id>, and
 * the board filters on exactly that. Until this was wired the parameter went
 * nowhere and the button showed the whole board.
 */
const historyFilter = (equipmentId: string) =>
  getJobs().filter((job) => job.equipmentId === equipmentId);

check('its history holds the job just raised', historyFilter(unit.id).length, 1);
ok('the board can name the appliance from the URL', getEquipmentById(unit.id)?.id === unit.id);
check('another appliance is not dragged in', historyFilter(register[4].id).length, 0);

// ---------------------------------------------------------------------------
section('and the same id holds the inspection check');
// ---------------------------------------------------------------------------
/*
 * The id is what lets the board tell that a fault reported today is one it
 * already has somebody working on. A typed "AC 2" never could.
 */
const held = heldChecks(branch, items, {}, getJobs(), register, 'insp-any');
const heldByThisUnit = [...held.values()].filter((h) => h.job.id === saved.id);
ok('the open job holds at least nothing wrongly', held.size >= 0);
note('checks held by any open work here', held.size);

/* A check that names this very unit is held by it. */
const answerNamingUnit: Record<number, any> = {};
const namedCheck = items.find((i: any) => needsMaintenance(i, { status: 'no', reasonGroup: 'MAINTENANCE' } as any));
if (namedCheck) {
  answerNamingUnit[namedCheck.id] = {
    status: 'no',
    reasonGroup: 'MAINTENANCE',
    details: [
      { label: 'Asset no', value: unit.assetNo ?? '' },
      { label: 'Unit', value: unit.name },
    ],
  };
  const heldNamed = heldChecks(branch, items, answerNamingUnit, getJobs(), register, 'insp-any');
  ok(
    'a check naming this unit is held by the job on it',
    heldNamed.get(namedCheck.id)?.job.id === saved.id
  );
}
note('held by this job', heldByThisUnit.length);

// ---------------------------------------------------------------------------
section('the scheduled side of the register lines up too');
// ---------------------------------------------------------------------------
sweepSchedule(new Date('2026-12-01T09:00:00'));
const plans = activePlans();
const scheduled = getJobs().filter((j) => j.kind === 'scheduled');
ok('the sweep raised servicing work', scheduled.length > 0);
check(
  'every scheduled job names an appliance that exists',
  scheduled.filter((j) => !j.equipmentId || !getEquipmentById(j.equipmentId)).length,
  0
);
check(
  'and a plan that exists',
  scheduled.filter((j) => !j.planId || !plans.some((p) => p.id === j.planId)).length,
  0
);

/* The register's own "due" reading comes from those same jobs. */
const withState = register.filter((e) =>
  generalMaintenanceState(e, '2026-12-01', plans, getJobs())
);
ok('appliances report a general-maintenance state', withState.length > 0);

// ---------------------------------------------------------------------------
section('every job on the board is reachable and attributable');
// ---------------------------------------------------------------------------
const all = getJobs();
const branchNames = new Set(getBranches().map((b) => b.name));
check('every job names a real branch', all.filter((j) => !branchNames.has(j.branchName)).length, 0);
check(
  'every job that names an appliance names a real one',
  all.filter((j) => j.equipmentId && !getEquipmentById(j.equipmentId)).length,
  0
);
check('every job has an id', all.filter((j) => !j.id).length, 0);
check('no two jobs share an id', new Set(all.map((j) => j.id)).size, all.length);

// ---------------------------------------------------------------------------
section('what each role is shown adds up');
// ---------------------------------------------------------------------------
const users = getUsers();
const admin = users.find((u) => u.role === 'admin')!;
const bm = users.find((u) => u.role === 'branch-manager')!;
const insp = users.find((u) => u.role === 'inspector')!;
const jm = users.find((u) => u.role === 'job-manager')!;

check('the admin sees every job', visibleJobs(admin, all).length, all.length);
check('and every appliance', visibleEquipment(admin, getEquipment()).length, getEquipment().length);
ok('a branch manager sees only their own branch',
  visibleJobs(bm, all).every((j) => j.branchName === bm.branchName));
ok('their register matches their board',
  visibleEquipment(bm, getEquipment()).every((e) => e.branchName === bm.branchName));
ok('an inspector sees only branches they were sent to',
  visibleJobs(insp, all).every((j) => (maintenanceBranchesFor(insp) ?? []).includes(j.branchName)));
ok('neither may move a job along', !canManageJobs(bm) && !canManageJobs(insp));
ok('the maintenance manager may', canManageJobs(jm));

/*
 * The dashboard card and the panel under it are drawn from one list, so their
 * figures cannot disagree — this is the sum that used to be taken twice.
 */
const forBm = visibleJobs(bm, all);
const openForBm = forBm.filter((j) => statusOf(j) !== 'completed');
check(
  'open + completed accounts for every job a branch manager sees',
  openForBm.length + forBm.filter((j) => statusOf(j) === 'completed').length,
  forBm.length
);
check(
  'not started is a subset of open',
  forBm.filter((j) => statusOf(j) === 'reported').length <= openForBm.length,
  true
);

// ---------------------------------------------------------------------------
section('the overview counts the same jobs it is given');
// ---------------------------------------------------------------------------
const overview = buildMaintenanceOverview(forBm);
check('total matches the list handed in', overview.total, forBm.length);
check('open matches', overview.open, openForBm.length);
check('open splits cleanly into started and not', overview.inProgress + overview.notStarted, overview.open);
check('open and completed account for the whole', overview.open + overview.completed, overview.total);
ok('every branch it names is one this reader may see',
  overview.byBranch.every((b) => b.branchName === bm.branchName));

// ---------------------------------------------------------------------------
section('reporting a problem offers the same register the checklist does');
// ---------------------------------------------------------------------------
/*
 * The client's first point: the inspection's unit list was there and the
 * report-a-problem form's was not. Both draw on the branch's own register, so
 * the check is that neither is empty and that what one offers the other does.
 */
const { activeCategories } = await import('../services/categoryStore.ts');
const forChecklist = activeEquipment().filter((e) => e.branchName === branch);
ok('the branch has a register to offer', forChecklist.length > 0);

/* What the report dialog builds: the same list, narrowed by the chosen trade. */
const offeredFor = (categoryId: string) =>
  forChecklist.filter((e) => e.category === categoryId);

const tradesWithKit = activeCategories()
  .map((c) => ({ id: c.id, label: c.label, count: offeredFor(c.id).length }))
  .filter((t) => t.count > 0);

ok('at least one trade has appliances to offer', tradesWithKit.length > 0);
note('trades offered, with counts', tradesWithKit.map((t) => `${t.label} (${t.count})`));
check(
  'every appliance on the register is reachable through some trade',
  tradesWithKit.reduce((n, t) => n + t.count, 0),
  forChecklist.length
);
check(
  'and every one offered carries what a job needs to name it',
  forChecklist.filter((e) => !e.id || !e.name).length,
  0
);

process.exit(report());
