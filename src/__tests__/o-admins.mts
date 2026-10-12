/**
 * More than one Main Admin.
 *
 * The admin can create another Main Admin. Two guards stand in for the old
 * refusal: the last active Main Admin can never be withdrawn or demoted, and
 * nobody can withdraw or demote their own account, so an admin cannot lock
 * themselves out by mistake.
 */
import { freshBrowser, check, ok, note, section, report } from './harness.mts';
freshBrowser();

const { getUsers, addUser, updateUser, removeUser, authenticate, MANAGED_ROLES } =
  await import('../services/userStore.ts');
const { can } = await import('../services/permissions.ts');

const first = getUsers().find((u) => u.role === 'admin')!;

section('the admin creates a second Main Admin');
ok('Main Admin is one of the roles accounts are made in', MANAGED_ROLES.includes('admin'));
const made = addUser({ name: 'Second Admin', email: 'SecondAdmin', password: 'Second123', role: 'admin' });
ok('the account is created', made.ok);
const second = made.user!;
check('as a Main Admin', second.role, 'admin');
ok('it signs in', authenticate('SecondAdmin', 'Second123')?.id === second.id);
ok('and holds full control, for example over accounts', can(second, 'users.manage'));

section('nobody locks themselves out');
const selfRemove = removeUser(first.id, first.id);
ok('an admin cannot withdraw their own account', !selfRemove.ok);
note('refusal', selfRemove.error);
const selfDemote = updateUser(
  first.id,
  { name: first.name, email: first.email, password: first.password, role: 'inspector' },
  first.id
);
ok('nor take the Main Admin role off themselves', !selfDemote.ok);
check('the first admin is still an active admin', getUsers().find((u) => u.id === first.id)?.role, 'admin');

section('one admin may withdraw another, but never the last');
const removed = removeUser(second.id, first.id);
ok('the first admin withdraws the second', removed.ok);
const lastByOther = removeUser(first.id, 'someone-else');
ok('the last active Main Admin cannot be withdrawn, even by someone else', !lastByOther.ok);
const lastDemote = updateUser(
  first.id,
  { name: first.name, email: first.email, password: first.password, role: 'inspector' },
  'someone-else'
);
ok('nor demoted', !lastDemote.ok);

section('demoting another admin works while one remains');
const third = addUser({ name: 'Third Admin', email: 'ThirdAdmin', password: 'Third123', role: 'admin' }).user!;
const demoted = updateUser(
  third.id,
  { name: third.name, email: third.email, password: third.password, role: 'inspector' },
  first.id
);
ok('the first admin makes the third an inspector', demoted.ok);
check('who is now an inspector', getUsers().find((u) => u.id === third.id)?.role, 'inspector');

process.exit(report());
