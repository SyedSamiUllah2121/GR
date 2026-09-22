/**
 * The surprise-visit rotation on a clock.
 *
 * The one part of the app that writes inspection records without anybody
 * asking, so the things worth pinning down are when it writes, when it
 * refuses to, and that running it twice does not raise two visits.
 */
import { freshBrowser, check, ok, note, section, report } from './harness.mts';
freshBrowser();

const { getInspections, saveInspection } = await import('../services/storage.ts');
const { getSettings, saveSetting } = await import('../services/settings.ts');
const { sweepSurpriseVisits, nextAutoSurpriseDue } = await import('../services/assignments.ts');
const { getBranches } = await import('../services/branchStore.ts');
const { inspectionKindOf } = await import('../types.ts');

const at = (day: string) => new Date(`${day}T09:00:00`);
const surprises = () => getInspections().filter((i) => inspectionKindOf(i) === 'surprise');

section('off until the admin sets an interval');
check('the default is off', getSettings().autoSurpriseDays, 0);
check('nothing is due', nextAutoSurpriseDue(0, at('2026-09-22')), null);
check('a sweep raises nothing', sweepSurpriseVisits(at('2026-09-22')).raised, null);
check('and says why', sweepSurpriseVisits(at('2026-09-22')).reason, 'off');
check('no surprise visits on record', surprises().length, 0);

section('set to three days, with no visit ever raised');
saveSetting('autoSurpriseDays', 3);
/* Nothing to count from, so one is owed now rather than in three days. */
check('due today', nextAutoSurpriseDue(3, at('2026-09-22')), '2026-09-22');
const first = sweepSurpriseVisits(at('2026-09-22'));
ok('a visit was raised', !!first.raised);
check('it is a surprise visit', first.raised && inspectionKindOf(first.raised), 'surprise');
check('waiting to be carried out', first.raised?.status, 'assigned');
check('marked as raised by the system', first.raised?.autoRaised, true);
ok('handed to an inspector', !!first.raised?.assignedToUserId);
ok('nobody is named as having assigned it', first.raised?.assignedByUserId === undefined);
note('branch drawn', first.raised?.branchName);

section('running it again the same day does not raise a second');
const again = sweepSurpriseVisits(at('2026-09-22'));
check('nothing raised', again.raised, null);
/*
 * Because the one just raised moved the due date on, not because the id guard
 * caught it — that guard is there for two tabs sweeping in the same instant,
 * which a single-threaded test cannot stage.
 */
check('the next is not due yet', again.reason, 'not-due');
check('still one visit', surprises().length, 1);

section('and not before the interval is up');
check('not due on day two', sweepSurpriseVisits(at('2026-09-24')).reason, 'not-due');
check('next one falls on the third day', nextAutoSurpriseDue(3, at('2026-09-24')), '2026-09-25');
check('still one visit', surprises().length, 1);

section('the day it comes round again');
const second = sweepSurpriseVisits(at('2026-09-25'));
ok('a second visit was raised', !!second.raised);
check('two on record', surprises().length, 2);

section('a long silence owes one visit, not the whole backlog');
const third = sweepSurpriseVisits(at('2026-12-25'));
ok('one raised', !!third.raised);
check('three on record, not ninety', surprises().length, 3);

section('a visit raised by hand resets the clock');
saveInspection({
  ...third.raised!,
  id: 'insp-by-hand',
  autoRaised: undefined,
  assignedAt: at('2026-12-30').toISOString(),
  date: '2026-12-30',
});
check(
  'counted from the manual one',
  nextAutoSurpriseDue(3, at('2026-12-30')),
  '2027-01-02'
);
check('so the system holds off', sweepSurpriseVisits(at('2026-12-31')).reason, 'not-due');

section('the rotation holds while the work it raised is still outstanding');
/*
 * One unfinished surprise visit per branch and per inspector. The draw obeys
 * the same rule the form does, so once every inspector is carrying one the
 * rotation stops raising work rather than piling it up — which is the whole
 * point of the rule: a visit nobody has done is not a reason to book another.
 */
const stalled = sweepSurpriseVisits(new Date('2027-01-02T09:00:00'));
check('nothing is raised', stalled.raised, null);
check('and it says nobody is free to send', stalled.reason, 'no-inspector');

section('and picks up again once those visits are done');
/* Every outstanding visit signed off, which is what frees branch and person. */
getInspections()
  .filter((i) => inspectionKindOf(i) === 'surprise' && i.status !== 'submitted')
  .forEach((i) => saveInspection({ ...i, status: 'submitted', submittedAt: '2027-01-01T12:00:00.000Z' }));

const openNames = getBranches().filter((b) => b.active !== false).map((b) => b.name);
let day = new Date('2027-01-02T09:00:00');
const drawn: string[] = [];
for (let i = 0; i < openNames.length * 2; i += 1) {
  const result = sweepSurpriseVisits(day);
  if (result.raised) {
    drawn.push(result.raised.branchName);
    /* Carried out before the next one falls due, as the rule now requires. */
    saveInspection({
      ...result.raised,
      status: 'submitted',
      submittedAt: new Date(day.getTime() + 3600_000).toISOString(),
    });
  }
  day = new Date(day.getTime() + 3 * 24 * 60 * 60 * 1000);
}
note('branches drawn in order', drawn);
check('one draw per interval once the board is clear', drawn.length, openNames.length * 2);
/*
 * Two rounds' worth, taken from wherever the round happens to stand — visits
 * raised earlier in this file have already spent part of the deck, so a run of
 * nine is not a round and a branch may fairly come up again once the deck is
 * re-dealt. What holds whatever the boundary is: everywhere gets visited, and
 * nowhere gets visited twice running.
 */
check(
  'every branch is visited',
  openNames.filter((name) => !drawn.includes(name)),
  []
);
ok(
  'never the same branch twice running',
  drawn.every((name, i) => i === 0 || name !== drawn[i - 1])
);
ok('not simply the register in order', drawn.slice(0, openNames.length).join() !== openNames.join());

section('turning the draw off turns the schedule off with it');
saveSetting('randomAssignment', false);
check('nothing is due', nextAutoSurpriseDue(undefined, at('2027-06-01')), null);
check('and a sweep is a no-op', sweepSurpriseVisits(at('2027-06-01')).reason, 'off');
check('the interval itself is remembered', getSettings().autoSurpriseDays, 3);

process.exit(report());
