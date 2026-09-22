/**
 * What happens when the browser store refuses a write.
 *
 * The one failure this app must never have quietly. Answers are written on
 * every tap and photographs are held as data URLs, so the quota is reachable
 * on a real round — and until now every store swallowed the error, returned
 * nothing, and let the caller carry on saying "saved".
 */
import { freshBrowser, check, ok, note, section, report } from './harness.mts';
const store = freshBrowser();

const { saveInspection, saveActiveDraft, getInspections, getActiveDraft } = await import(
  '../services/storage.ts'
);
const { saveJob, getJobs } = await import('../services/maintenanceStore.ts');

/** A record shaped like a real one, so the failure is the only difference. */
const record = (id: string) =>
  ({
    id,
    branchName: 'Royal Gujarat',
    date: '2026-09-22',
    time: '9:00 am',
    status: 'draft',
    score: 0,
    signature: null,
    answers: {},
    currentSectionIndex: 0,
    inspectorName: 'Someone',
  }) as any;

section('while there is room');
ok('a record saves and says so', saveInspection(record('insp-ok-1')));
ok('and the draft slot too', saveActiveDraft(record('insp-ok-1')));
check('the record is on file', getInspections().filter((i) => i.id === 'insp-ok-1').length, 1);
ok('and the draft is in the slot', getActiveDraft()?.id === 'insp-ok-1');

section('once the store is full');
/*
 * What a browser does at the quota: setItem throws. Reads keep working, which
 * is why the failure is invisible without a returned answer.
 */
const realSetItem = (globalThis as any).localStorage.setItem;
let refusing = true;
(globalThis as any).localStorage.setItem = (k: string, v: string) => {
  if (refusing) {
    const err: any = new Error('QuotaExceededError');
    err.name = 'QuotaExceededError';
    throw err;
  }
  return realSetItem.call((globalThis as any).localStorage, k, v);
};

const before = getInspections().length;
ok('saving a record reports failure', saveInspection(record('insp-lost-1')) === false);
ok('saving the draft reports failure', saveActiveDraft(record('insp-lost-1')) === false);
check('and nothing was written', getInspections().length, before);
ok(
  'the record really is absent, not merely unreported',
  !getInspections().some((i) => i.id === 'insp-lost-1')
);

/* The maintenance store already worked this way; it must still. */
ok(
  'a job reports failure too',
  saveJob({
    id: 'mnt-lost-1',
    branchName: 'Royal Gujarat',
    title: 'x',
    details: '',
    equipment: '',
    category: 'general',
    priority: 'low',
    reportedBy: 'x',
    reportedAt: '2026-09-22T09:00:00.000Z',
    startedAt: null,
    completedAt: null,
    attendedBy: null,
    resolutionNote: null,
    cost: null,
    photo: null,
  } as any) === false
);
ok('and no job was written', !getJobs().some((j) => j.id === 'mnt-lost-1'));

section('and recovers when room is made');
refusing = false;
ok('the same record now saves', saveInspection(record('insp-lost-1')));
ok('and is on file', getInspections().some((i) => i.id === 'insp-lost-1'));
note('records held', getInspections().length);

(globalThis as any).localStorage.setItem = realSetItem;
note('keys in the store', store.size);

section('the demo doors close when a build says so');
/*
 * Two ways in without a password — the role switcher and the 123/123
 * shorthand — both landing on the main admin. They are ON by default, because
 * what this is deployed as today is a demonstration and one nobody can get
 * into is not one.
 *
 * Which makes this the test that matters: the one switch standing between that
 * and an estate's real records has to actually shut them. Set before the module
 * is imported, because the flag is read once when it loads — which is also how
 * `next build` inlines it.
 */
process.env.NEXT_PUBLIC_DEMO_SIGN_IN = 'false';

const { DEMO_SIGN_IN_ENABLED, signIn, signInAs } = await import('../services/session.ts');
const { getUsers } = await import('../services/userStore.ts');

check('the flag reads as off', DEMO_SIGN_IN_ENABLED, false);

const adminAccount = getUsers().find((u) => u.role === 'admin')!;
const impersonated = signInAs(adminAccount.id);
ok('signing in as an account without a password is refused', !impersonated.ok);
ok('and no session was started', !impersonated.user);
note('what it says', impersonated.error);

const shorthand = signIn('123', '123');
ok('the 123/123 shorthand is refused', !shorthand.ok);
note('what it says', shorthand.error);

/* A real address and the right password still works, which is the point. */
const properly = signIn(adminAccount.email, adminAccount.password);
ok('a real sign-in still succeeds', properly.ok);
check('as the right account', properly.user?.id, adminAccount.id);

process.exit(report());
