import { freshBrowser, check, ok, note, section, report } from './harness.mts';
freshBrowser();

const { getEquipment } = await import('../services/equipmentStore.ts');
const { getJobs, saveJob } = await import('../services/maintenanceStore.ts');
const { sweepSchedule, upcomingServices, nextDueFor } = await import('../services/maintenanceSchedule.ts');
const { getPlans, activePlans } = await import('../services/maintenancePlanStore.ts');

section('the board over time — it must not accumulate');
const days = ['2026-09-21','2026-09-22','2026-09-26','2026-10-05','2026-11-02','2026-12-31','2027-06-30'];
let prev = 0;
for (const d of days) {
  sweepSchedule(new Date(`${d}T09:00:00`));
  const n = getJobs().length;
  console.log(`      ${d}   board: ${String(n).padStart(4)}   (+${n - prev})`);
  prev = n;
}
const board = getJobs();
ok('no job raised twice', new Set(board.map(j=>j.id)).size === board.length);

section('one job per missed interval? no — one job');
const equipment = getEquipment();
const due = equipment.filter(e => e.serviceStatus === 'due');
const perAsset = new Map<string, number>();
board.filter(j=>j.kind==='scheduled').forEach(j => {
  perAsset.set(j.equipmentId!, (perAsset.get(j.equipmentId!) ?? 0) + 1);
});
note('open jobs for one due AC after 9 months of sweeps', perAsset.get(due[0].id));
ok('an open job is never re-raised, however long it stands',
   perAsset.get(due[0].id) === 1);
ok('no asset ever holds two open jobs for one plan',
   [...perAsset.values()].every(n => n === 1));

section('completing a service resets the clock');
freshBrowser();
const { getEquipment: ge2 } = await import('../services/equipmentStore.ts?v=2');
const { sweepSchedule: sweep2, nextDueFor: next2 } = await import('../services/maintenanceSchedule.ts?v=2');
const { getJobs: gj2, saveJob: sj2 } = await import('../services/maintenanceStore.ts?v=2');
const { activePlans: ap2 } = await import('../services/maintenancePlanStore.ts?v=2');

// swept forward to a day the routine service has genuinely come round
sweep2(new Date('2026-09-26T09:00:00'));
const eq2 = ge2();
const target = eq2.find(e => e.assetNo === 'NHB-ACU-001')!;  // serviced 12 Aug, due 26 Sep
const gplan = ap2().find(p => p.id === 'plan-ac_ventilation-general-maintenance')!;
note('before the work, next due', next2(gplan, target, gj2(), '2026-09-26'));

const open = gj2().find(j => j.equipmentId === target.id && j.planId === gplan.id)!;
sj2({ ...open, startedAt: '2026-09-22T09:00:00.000Z', completedAt: '2026-09-22T12:00:00.000Z',
      attendedBy: 'Cool Air', resolutionNote: 'Filters washed, gas checked.' });
note('after the work, next due', next2(gplan, target, gj2(), '2026-09-22'));
const after = next2(gplan, target, gj2(), '2026-09-22');
check('next service counts 45 days from the work', after?.dueOn, '2026-11-06');
ok('it is no longer overdue', (after?.daysOverdue ?? 0) < 0);

section('performance at real volume');
const t0 = performance.now();
for (let i = 0; i < 20; i++) upcomingServices('2026-09-21', ap2(), ge2(), gj2());
const ms = (performance.now() - t0) / 20;
note('upcomingServices over 302 assets (ms)', Math.round(ms * 100) / 100);
ok('schedule pass stays under 50ms', ms < 50);

const t1 = performance.now();
for (let i = 0; i < 20; i++) sweep2(new Date('2026-09-21T09:00:00'));
const ms2 = (performance.now() - t1) / 20;
note('a no-op sweep on app open (ms)', Math.round(ms2 * 100) / 100);
ok('no-op sweep stays under 100ms', ms2 < 100);

section('storage footprint — one small browser store holds all of it');
const store = (globalThis as any).localStorage;
let total = 0;
const sizes: [string, number][] = [];
for (let i = 0; i < store.length; i++) {
  const k = store.key(i)!;
  const bytes = (k.length + (store.getItem(k)?.length ?? 0)) * 2; // UTF-16
  sizes.push([k, bytes]); total += bytes;
}
sizes.sort((a,b)=>b[1]-a[1]).slice(0,5).forEach(([k,b]) =>
  console.log(`      ${k.padEnd(46)} ${(b/1024).toFixed(1)} KB`));
note('total after a full year of sweeps (KB)', Math.round(total/1024));
ok('well inside a 5MB localStorage budget', total < 5 * 1024 * 1024 * 0.4);
note('headroom left for photographs (KB)', Math.round((5*1024*1024 - total)/1024));

process.exit(report());
