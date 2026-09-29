/**
 * The estate's real branch managers, and the manager who runs two branches.
 *
 * Seven people across nine branches: Parvezuddin runs both Shabiya 11 and 12,
 * Musa Shafqat both Mussafah 26 branches. Each signs in with their name run
 * together and that name followed by 123, and sees every branch they run from
 * the one account. A browser that already holds the invented managers the
 * first seed shipped has them retired, not left beside the real ones.
 */
import { freshBrowser, check, ok, section, report } from './harness.mts';
freshBrowser();

const { getUsers, authenticate, addUser, SEED_USERS } = await import('../services/userStore.ts');
const { getBranches } = await import('../services/branchStore.ts');
const { canViewInspection, canPerformInspection, filingBranchesFor, fixedBranchFor } =
  await import('../services/permissions.ts');
const { branchesOf } = await import('../types.ts');

section('the managers a fresh browser starts with');
const managers = getUsers().filter((u) => u.role === 'branch-manager');
check('seven of them', managers.length, 7);
check(
  'sign-in names and passwords',
  managers.map((u) => [u.name, u.email, u.password]),
  [
    ['Parvezuddin', 'Parvezuddin', 'Parvezuddin123'],
    ['Ali Barakat', 'AliBarakat', 'AliBarakat123'],
    ['Musa Shafqat', 'MusaShafqat', 'MusaShafqat123'],
    ['Mehran Shahabuddin', 'MehranShahabuddin', 'MehranShahabuddin123'],
    ['Mr. Altaf', 'Mr.Altaf', 'Mr.Altaf123'],
    ['Muhammad Arshaan', 'MuhammadArshaan', 'MuhammadArshaan123'],
    ['Farooq Khan', 'FarooqKhan', 'FarooqKhan123'],
  ]
);
ok('no sign-in name or password holds a space',
  managers.every((u) => !/\s/.test(u.email) && !/\s/.test(u.password)));

const branchNames = getBranches().map((b) => b.name);
const covered = managers.flatMap((u) => branchesOf(u));
check('every branch has exactly one manager', [...covered].sort(), [...branchNames].sort());

section('signing in');
ok('Parvezuddin / Parvezuddin123', authenticate('Parvezuddin', 'Parvezuddin123')?.id === 'usr-bm-parvezuddin');
ok('the name in any case', authenticate('parvezuddin', 'Parvezuddin123') !== null);
ok('but not the password', authenticate('Parvezuddin', 'parvezuddin123') === null);
ok('the name typed with its space', authenticate('Mehran Shahabuddin', 'MehranShahabuddin123')?.id === 'usr-bm-mehran-shahabuddin');
ok('and with stray spaces round it', authenticate('  Ali Barakat ', 'AliBarakat123') !== null);
ok('Mr. Altaf signs in as typed', authenticate('Mr. Altaf', 'Mr.Altaf123')?.name === 'Mr. Altaf');

section('a manager who runs two branches');
const parvez = managers.find((u) => u.email === 'Parvezuddin')!;
const [own1, own2] = branchesOf(parvez);
const elsewhere = branchNames.find((b) => !branchesOf(parvez).includes(b))!;
const visit = (branchName: string) =>
  ({ id: `insp-${branchName}`, branchName, kind: 'monday', status: 'draft' }) as any;
ok('sees a record at the first', canViewInspection(parvez, visit(own1)));
ok('and at the second', canViewInspection(parvez, visit(own2)));
ok('not at anyone else’s', !canViewInspection(parvez, visit(elsewhere)));
ok('runs the Monday round at both', canPerformInspection(parvez, visit(own1)) && canPerformInspection(parvez, visit(own2)));
check('files against either', filingBranchesFor(parvez), [own1, own2]);
check('so neither is locked in', fixedBranchFor(parvez), null);
const ali = managers.find((u) => u.email === 'AliBarakat')!;
check('a one-branch manager is still locked to theirs', fixedBranchFor(ali), branchesOf(ali)[0]);

section('the admin creates an account by username');
const made = addUser({
  name: 'Test Person', email: 'TestPerson', password: 'TestPerson123',
  role: 'branch-manager', branchNames: [own1, own2],
});
ok('a username with no @ is accepted', made.ok);
check('and keeps both branches', made.user?.branchNames, [own1, own2]);
const spaced = addUser({
  name: 'Spaced', email: 'Spaced Name', password: 'x123', role: 'inspector',
});
ok('one typed with a space is accepted', spaced.ok);
check('with the space left out', spaced.user?.email, 'SpacedName');
ok('and signs in either way', authenticate('Spaced Name', 'x123') !== null && authenticate('SpacedName', 'x123') !== null);
const bad = addUser({ name: 'Bad', email: 'bad@nowhere', password: 'x123', role: 'inspector' });
ok('a broken email address is still refused', !bad.ok);

section('a browser still holding the invented managers');
const store = freshBrowser();
store.set('inspection_log_estate_v2', '2026-09-01T00:00:00Z');
store.set('inspection_log_users_seed_version', '1');
const admin = SEED_USERS.find((u) => u.role === 'admin')!;
const invented = (id: string, email: string, branchName: string) => ({
  id, name: id, email, password: 'branch123', role: 'branch-manager', branchName,
  initials: 'XX', active: true, createdAt: '2026-09-17',
});
store.set('inspection_log_users_v1', JSON.stringify([
  admin,
  invented('usr-bm-rg', 'royal@royalgujrat.com', 'Royal Gujarat'),
  invented('usr-bm-nhb', 'shabiya11@royalgujrat.com', branchNames[0]),
  // Repointed by the admin at a real person: not the seed any more
  invented('usr-bm-zg', 'someone.real@royalgujrat.com', branchNames[8]),
]));
store.set('inspection_log_records_v7', JSON.stringify([
  { id: 'insp-old', branchName: branchNames[0], status: 'submitted', submittedByUserId: 'usr-bm-nhb' },
]));

const after = getUsers();
const byId = (id: string) => after.find((u) => u.id === id);
ok('an unused invented manager is gone', !byId('usr-bm-rg'));
check('one with history is kept but withdrawn', byId('usr-bm-nhb')?.active, false);
ok('one the admin repointed is left alone', byId('usr-bm-zg')?.active === true);
check('and its single branch reads as a list of one', byId('usr-bm-zg')?.branchNames, [branchNames[8]]);
ok('the real managers have arrived', authenticate('MusaShafqat', 'MusaShafqat123') !== null);
ok('the invented sign-in no longer works', authenticate('royal@royalgujrat.com', 'branch123') === null);
check('and it happens once', getUsers().length, after.length);

section('a browser holding the first sign-in Mr. Altaf was given');
const store2 = freshBrowser();
store2.set('inspection_log_estate_v2', '2026-09-01T00:00:00Z');
store2.set('inspection_log_users_seed_version', '2');
const shipped = SEED_USERS.map((u) =>
  u.id === 'usr-bm-altaf' ? { ...u, email: 'Altaf', password: 'Altaf123' } : u
);
store2.set('inspection_log_users_v1', JSON.stringify(shipped));
ok('is moved to Mr.Altaf / Mr.Altaf123', authenticate('Mr.Altaf', 'Mr.Altaf123')?.id === 'usr-bm-altaf');
ok('and the old one stops working', authenticate('Altaf', 'Altaf123') === null);
check('with no account added or lost', getUsers().length, SEED_USERS.length);

const store3 = freshBrowser();
store3.set('inspection_log_estate_v2', '2026-09-01T00:00:00Z');
store3.set('inspection_log_users_seed_version', '2');
store3.set('inspection_log_users_v1', JSON.stringify(SEED_USERS.map((u) =>
  u.id === 'usr-bm-altaf' ? { ...u, email: 'Altaf', password: 'AdminChose1' } : u
)));
ok('but a password the admin has since set is left alone',
  authenticate('Altaf', 'AdminChose1')?.id === 'usr-bm-altaf');

section('switching between two branches');
freshBrowser();
const { signIn, signOut, currentUser, switchBranch, switchableBranches } =
  await import('../services/session.ts');
signIn('MusaShafqat', 'MusaShafqat123');
const musaAll = switchableBranches();
check('Musa has both to switch between', musaAll.branches.length, 2);
const [m1, m2] = musaAll.branches;
check('and starts on his first', currentUser()?.branchNames, [m1]);
ok('which is the one he sees', canViewInspection(currentUser(), visit(m1)) && !canViewInspection(currentUser(), visit(m2)));
ok('switching is accepted', switchBranch(m2));
check('and moves him', currentUser()?.branchNames, [m2]);
ok('so the other one is now on screen', canViewInspection(currentUser(), visit(m2)) && !canViewInspection(currentUser(), visit(m1)));
check('and is what a new round is filed against', fixedBranchFor(currentUser()), m2);
ok('a branch he does not run is refused', !switchBranch(branchNames.find((b) => !musaAll.branches.includes(b))!));
check('leaving him where he was', currentUser()?.branchNames, [m2]);
signOut();
signIn('Musa Shafqat', 'MusaShafqat123');
check('signing in again starts from his first branch', currentUser()?.branchNames, [m1]);
signOut();
signIn('AliBarakat', 'AliBarakat123');
check('a one-branch manager has nothing to switch', switchableBranches().branches, []);

process.exit(report());
