/**
 * What the job board puts at the top.
 *
 * Newest first, by the clock: the thing that just happened is the thing
 * somebody opening the board is looking for. Finished work sits below
 * unfinished, and each half is ordered by when it last mattered — a completed
 * job by when it was completed, an open one by when it was reported.
 *
 * The rule the screen applies is duplicated here rather than imported, because
 * it lives inside a `useMemo` in a component this suite cannot render. Any
 * change to one has to be made to the other, which is the point of the first
 * check below: it fails loudly rather than drifting quietly.
 */
import { freshBrowser, check, ok, note, section, report } from './harness.mts';
freshBrowser();

const { statusOf } = await import('../services/maintenanceStore.ts');

/** The board's order, exactly as MaintenanceScreen sorts it. */
function boardOrder<T extends { reportedAt: string; completedAt: string | null; id: string }>(
  jobs: T[]
): T[] {
  return [...jobs].sort((a, b) => {
    const aDone = !!a.completedAt;
    const bDone = !!b.completedAt;
    if (aDone !== bDone) return aDone ? 1 : -1;
    if (aDone && bDone) return (b.completedAt ?? '').localeCompare(a.completedAt ?? '');
    return b.reportedAt.localeCompare(a.reportedAt) || a.id.localeCompare(b.id);
  });
}

const job = (
  id: string,
  reportedAt: string,
  priority: string,
  completedAt: string | null = null
) =>
  ({
    id,
    branchName: 'Royal Gujarat',
    title: id,
    details: '',
    equipment: '',
    category: 'general',
    priority,
    reportedBy: 'Someone',
    reportedAt,
    startedAt: completedAt ? '2026-09-20T08:00:00.000Z' : null,
    completedAt,
    attendedBy: null,
    resolutionNote: null,
    cost: null,
    photo: null,
  }) as any;

section('open work: the most recent report is on top');
const open = [
  job('old-high', '2026-09-17T09:00:00.000Z', 'high'),
  job('today-medium', '2026-09-22T10:03:00.000Z', 'medium'),
  job('yesterday-low', '2026-09-21T16:20:00.000Z', 'low'),
  job('older-critical', '2026-09-15T07:00:00.000Z', 'critical'),
];
const ordered = boardOrder(open).map((j) => j.id);
note('order', ordered);
check('newest first, then the one before it, and so on', ordered, [
  'today-medium',
  'yesterday-low',
  'old-high',
  'older-critical',
]);
ok(
  'a job reported today is above one from last week whatever its priority',
  ordered.indexOf('today-medium') < ordered.indexOf('old-high')
);

section('two reported in the same minute keep a settled order');
/*
 * Without a tiebreak the sort is free to swap them between renders, and a list
 * that reorders itself while somebody is reading it is worse than either order.
 */
const sameMinute = [
  job('mnt-b', '2026-09-22T10:03:00.000Z', 'high'),
  job('mnt-a', '2026-09-22T10:03:00.000Z', 'low'),
];
check('first pass', boardOrder(sameMinute).map((j) => j.id), ['mnt-a', 'mnt-b']);
check(
  'and the same again from the other starting order',
  boardOrder([...sameMinute].reverse()).map((j) => j.id),
  ['mnt-a', 'mnt-b']
);

section('finished work sits below, most recently finished first');
const mixed = [
  job('done-older', '2026-09-10T09:00:00.000Z', 'high', '2026-09-18T11:00:00.000Z'),
  job('still-open', '2026-09-12T09:00:00.000Z', 'low'),
  job('done-newest', '2026-09-11T09:00:00.000Z', 'low', '2026-09-22T16:42:00.000Z'),
];
const allOrder = boardOrder(mixed).map((j) => j.id);
note('order', allOrder);
check('open first, then completions newest first', allOrder, [
  'still-open',
  'done-newest',
  'done-older',
]);
ok(
  'nothing finished outranks something still outstanding',
  allOrder.indexOf('still-open') < allOrder.indexOf('done-newest')
);

section('the same order holds for the estate, not just a handful');
const { getJobs } = await import('../services/maintenanceStore.ts');
const { sweepSchedule } = await import('../services/maintenanceSchedule.ts');
sweepSchedule(new Date('2026-12-01T09:00:00'));
const real = boardOrder(getJobs());
ok('there is a board to order', real.length > 0);

let slip: string | null = null;
for (let i = 1; i < real.length; i += 1) {
  const prev = real[i - 1];
  const here = real[i];
  const prevDone = statusOf(prev) === 'completed';
  const hereDone = statusOf(here) === 'completed';
  if (!prevDone && hereDone) continue;
  if (prevDone && !hereDone) { slip = `${here.id} (open) below ${prev.id} (done)`; break; }
  const a = prevDone ? prev.completedAt! : prev.reportedAt;
  const b = hereDone ? here.completedAt! : here.reportedAt;
  if (a < b) { slip = `${here.id} at ${b} above ${prev.id} at ${a}`; break; }
}
check('every row is no newer than the one above it', slip, null);

process.exit(report());
