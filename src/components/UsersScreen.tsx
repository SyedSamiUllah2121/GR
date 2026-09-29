'use client';

import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  KeyRound,
  Mail,
  Pencil,
  Plus,
  RotateCcw,
  Shield,
  ShieldCheck,
  Store,
  UserRound,
  UserX,
  Wrench,
  X,
} from 'lucide-react';
import {
  USER_ROLE_BLURB,
  USER_ROLE_KEYS,
  USER_ROLE_LABEL,
  User,
  UserRole,
  branchesOf,
} from '../types';
import {
  MANAGED_ROLES,
  UserDraft,
  addUser,
  removeUser,
  restoreUser,
  updateUser,
  userUsage,
} from '../services/userStore';
import { activeBranches } from '../services/branchStore';
import { useBranches } from '../hooks/useBranches';
import { useDialog } from '../hooks/useDialog';
import { useUsers } from '../hooks/useUsers';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { formatDate } from '../services/reportModel';
import { BUTTON, Card, PageHeader } from './ui';
import { CountUp, EASE_OUT, Reveal, Stagger, StaggerItem, t } from './motion';

/**
 * Accounts and access — the admin's screen.
 *
 * Grouped by role rather than listed flat, because the roles are the point:
 * the question being answered here is "who can do what", and a single
 * alphabetical list of nine people answers it only if you already know
 * everyone's job. Each group carries the one-line description of what that
 * role can reach, so the consequence of putting someone in it is on screen
 * next to the decision.
 *
 * Withdrawing rather than deleting, wherever an account has touched an
 * inspection: the records it submitted still name a real person. See
 * `removeUser`.
 */

/** In order of reach, which is how types.ts lists them. */
const ROLE_ORDER = USER_ROLE_KEYS;

const ROLE_ICON: Record<UserRole, React.ComponentType<{ className?: string }>> = {
  admin: ShieldCheck,
  'branch-manager': Store,
  // The same wrench the maintenance module is marked with, because that
  // module is the whole of what this role opens
  'job-manager': Wrench,
  inspector: UserRound,
};

/** An empty form, for a role the admin has already chosen from the group. */
const blankDraft = (role: UserRole): UserDraft => ({
  name: '',
  email: '',
  password: '',
  role,
  branchNames: undefined,
});

export const UsersScreen: React.FC = () => {
  const signedInAs = useCurrentUser();
  const users = useUsers();
  const branches = activeBranches(useBranches());

  /** Which form is open: a role to add into, an account to edit, or nothing. */
  const [editing, setEditing] = useState<{ user: User | null; draft: UserDraft } | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<{
    user: User;
    usage: { submitted: number; assigned: number };
  } | null>(null);

  const grouped = useMemo(
    () =>
      ROLE_ORDER.map((role) => ({
        role,
        // Active first, then withdrawn, each alphabetically — a withdrawn
        // account is history rather than a colleague, so it sits below.
        members: users
          .filter((u) => u.role === role)
          .sort((a, b) =>
            a.active === b.active ? a.name.localeCompare(b.name) : a.active ? -1 : 1
          ),
      })),
    [users]
  );

  const startAdd = (role: UserRole) => {
    setFormError(null);
    setNotice(null);
    setEditing({ user: null, draft: blankDraft(role) });
  };

  const startEdit = (user: User) => {
    setFormError(null);
    setNotice(null);
    setEditing({
      user,
      draft: {
        name: user.name,
        email: user.email,
        password: user.password,
        role: user.role,
        branchNames: branchesOf(user),
      },
    });
  };

  const save = () => {
    if (!editing) return;
    const result = editing.user
      ? updateUser(editing.user.id, editing.draft)
      : addUser(editing.draft);

    if (!result.ok) {
      setFormError(result.error ?? 'Could not save the account');
      return;
    }
    setNotice(
      editing.user
        ? `${result.user?.name} updated`
        : `${result.user?.name} added as ${USER_ROLE_LABEL[editing.draft.role]}`
    );
    setEditing(null);
    setFormError(null);
  };

  const askToRemove = (user: User) => {
    setNotice(null);
    setPendingRemoval({ user, usage: userUsage(user) });
  };

  const confirmRemoval = () => {
    if (!pendingRemoval) return;
    const { user } = pendingRemoval;
    const result = removeUser(user.id);
    setPendingRemoval(null);

    if (!result.ok) {
      setNotice(result.error ?? 'Could not withdraw the account');
      return;
    }
    setNotice(
      result.deactivated
        ? `${user.name} can no longer sign in — their inspection history is kept`
        : `${user.name} removed`
    );
  };

  const restore = (user: User) => {
    const result = restoreUser(user.id);
    setNotice(result.ok ? `${user.name} can sign in again` : result.error ?? null);
  };

  const activeCount = users.filter((u) => u.active).length;

  return (
    <div className="p-5 sm:p-6 md:p-8 lg:p-10 flex-1 space-y-6 max-w-[1440px] w-full mx-auto">
      <Reveal>
        <PageHeader
          eyebrow="Administration"
          title="Users & access"
          subtitle={
            <>
              {activeCount} active account{activeCount === 1 ? '' : 's'} across{' '}
              {ROLE_ORDER.length} roles
            </>
          }
          actions={
            <button
              type="button"
              id="users-add-btn"
              onClick={() => startAdd('branch-manager')}
              className={`${BUTTON.primary} whitespace-nowrap`}
            >
              <Plus className="w-4 h-4" />
              <span>Add user</span>
            </button>
          }
        />
      </Reveal>

      {/*
        The roster at a glance: one tile per role, each a way down to its group.
        The figure is the active accounts only — a withdrawn one cannot sign in,
        so counting it would overstate who has access.
      */}
      <Stagger className="grid grid-cols-2 xl:grid-cols-4 gap-3 sm:gap-5">
        {grouped.map(({ role, members }) => {
          const Icon = ROLE_ICON[role];
          const active = members.filter((u) => u.active).length;
          const withdrawn = members.length - active;
          return (
            <StaggerItem key={role}>
              <a
                href={`#users-group-${role}`}
                className="group h-full block bg-white border border-[#E8E9EE] rounded-2xl p-4 sm:p-5 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_2px_8px_-2px_rgba(16,24,40,0.06)] transition-all duration-200 hover:-translate-y-0.5 hover:border-[#DADCE2] hover:shadow-[0_12px_24px_-12px_rgba(16,24,40,0.18)]"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="text-[12px] font-semibold text-[#6B6F76] truncate">
                    {USER_ROLE_LABEL[role]}
                  </span>
                  <span className="w-8 h-8 rounded-lg bg-[#F4F5F7] text-[#17181D] flex items-center justify-center shrink-0 group-hover:bg-[#FDECEE] group-hover:text-[#C8202D] transition-colors">
                    <Icon className="w-4 h-4" />
                  </span>
                </span>
                <p className="mt-2 text-[28px] leading-none font-bold tracking-tight text-[#17181D]">
                  <CountUp value={active} />
                </p>
                <p className="mt-2 text-[11px] text-[#9CA1A9] truncate">
                  {withdrawn > 0 ? `${withdrawn} withdrawn` : active === 1 ? 'account' : 'accounts'}
                </p>
              </a>
            </StaggerItem>
          );
        })}
      </Stagger>

      <AnimatePresence initial={false}>
        {notice && (
          <motion.div
            key="notice"
            id="users-notice"
            role="status"
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: t(0.25), ease: EASE_OUT }}
            className="px-4 py-3 rounded-xl bg-[#EAF6EF] border border-[#157F4B]/20 text-[#12643C] text-xs font-semibold flex items-center gap-2.5"
          >
            <span className="w-6 h-6 rounded-full bg-[#157F4B]/10 flex items-center justify-center shrink-0">
              <Check className="w-3.5 h-3.5" />
            </span>
            <span className="flex-1">{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss"
              className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-[#157F4B]/10 transition-colors cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {editing && (
        <UserForm
          // A fresh form, and a fresh arrival, for each account opened
          key={editing.user?.id ?? 'new'}
          draft={editing.draft}
          editingExisting={editing.user}
          branches={branches.map((b) => b.name)}
          error={formError}
          onChange={(draft) => setEditing({ ...editing, draft })}
          onSave={save}
          onCancel={() => {
            setEditing(null);
            setFormError(null);
          }}
        />
      )}

      <Stagger className="space-y-5">
        {grouped.map(({ role, members }) => {
          const Icon = ROLE_ICON[role];
          return (
            <StaggerItem key={role} as="section">
              <div
                id={`users-group-${role}`}
                className="scroll-mt-24 bg-white border border-[#E8E9EE] rounded-2xl shadow-[0_1px_2px_rgba(16,24,40,0.04),0_2px_8px_-2px_rgba(16,24,40,0.06)] overflow-hidden"
              >
                <div className="px-5 sm:px-6 py-4 border-b border-[#F0F1F4] flex items-center gap-3">
                  <span className="w-9 h-9 rounded-xl bg-[#F4F5F7] text-[#17181D] flex items-center justify-center shrink-0">
                    <Icon className="w-[18px] h-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 className="text-[15px] font-bold text-[#17181D]">
                      {USER_ROLE_LABEL[role]}
                      <span className="ml-2 inline-block align-[2px] rounded-full bg-[#F4F5F7] px-2 py-0.5 text-[11px] leading-none font-bold text-[#6B6F76] tabular-nums">
                        {members.filter((u) => u.active).length}
                      </span>
                    </h3>
                    <p className="text-xs text-[#6B6F76] mt-0.5">{USER_ROLE_BLURB[role]}</p>
                  </div>
                  {/*
                    Only the two roles the admin creates get an Add button. A
                    second main admin is not something this screen mints — the
                    one that exists is edited, not replaced.
                  */}
                  {MANAGED_ROLES.includes(role) && (
                    <button
                      type="button"
                      id={`users-add-${role}`}
                      onClick={() => startAdd(role)}
                      className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-[#F4F5F7] text-[11px] font-bold text-[#17181D] hover:bg-[#FDECEE] hover:text-[#C8202D] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add
                    </button>
                  )}
                </div>

                {members.length === 0 ? (
                  <div className="px-5 sm:px-6 py-8 flex flex-col items-center text-center">
                    <span className="w-10 h-10 rounded-xl bg-[#F4F5F7] text-[#9CA1A9] flex items-center justify-center">
                      <Icon className="w-5 h-5" />
                    </span>
                    <p className="mt-3 text-xs text-[#6B6F76]">
                      No {USER_ROLE_LABEL[role].toLowerCase()} accounts yet.
                    </p>
                  </div>
                ) : (
                  <ul className="divide-y divide-[#F0F1F4]">
                    {members.map((member) => (
                      <UserRow
                        key={member.id}
                        user={member}
                        isSelf={member.id === signedInAs?.id}
                        onEdit={() => startEdit(member)}
                        onRemove={() => askToRemove(member)}
                        onRestore={() => restore(member)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            </StaggerItem>
          );
        })}
      </Stagger>

      {pendingRemoval && (
        <RemovalDialog
          user={pendingRemoval.user}
          usage={pendingRemoval.usage}
          onCancel={() => setPendingRemoval(null)}
          onConfirm={confirmRemoval}
        />
      )}
    </div>
  );
};

/** A square icon button, for the quiet actions at the end of a row. */
const ROW_ACTION =
  'w-8 h-8 rounded-lg flex items-center justify-center text-[#6B6F76] border border-transparent transition-colors cursor-pointer';

/** One account. */
const UserRow: React.FC<{
  user: User;
  isSelf: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onRestore: () => void;
}> = ({ user, isSelf, onEdit, onRemove, onRestore }) => (
  <li
    className={`px-5 sm:px-6 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 group transition-colors ${
      user.active ? 'hover:bg-[#FAFBFC]' : 'bg-[#FAFBFC]'
    }`}
  >
    <span
      className={`w-10 h-10 rounded-full text-[12px] font-bold flex items-center justify-center shrink-0 ${
        user.active
          ? 'bg-gradient-to-br from-[#D8303D] to-[#A81823] text-white shadow-[0_4px_10px_-4px_rgba(200,32,45,0.6)]'
          : 'bg-[#EBEDF0] text-[#9CA1A9]'
      }`}
    >
      {user.initials}
    </span>

    <div className="min-w-0 flex-1">
      <p
        className={`text-[13px] font-bold flex items-center gap-2 flex-wrap ${
          user.active ? 'text-[#17181D]' : 'text-[#6B6F76]'
        }`}
      >
        <span className="truncate">{user.name}</span>
        {isSelf && (
          <span className="px-1.5 py-0.5 rounded-md bg-[#FDECEE] text-[#C8202D] text-[10px] font-bold uppercase tracking-wide">
            You
          </span>
        )}
        {!user.active && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#EBEDF0] text-[#6B6F76] text-[10px] font-bold uppercase tracking-wide">
            <span className="w-1.5 h-1.5 rounded-full bg-[#9CA1A9]" />
            Withdrawn
          </span>
        )}
      </p>
      <p className="text-xs text-[#6B6F76] truncate mt-0.5">{user.email}</p>
    </div>

    {/*
      Below the name on a phone, beside it from sm up. Beside it on a narrow
      screen, a long branch name squeezed the person's own name to "Farooq …".
    */}
    {branchesOf(user).length > 0 && (
      <span className="order-last basis-full pl-14 sm:order-none sm:basis-auto sm:pl-0 flex flex-wrap sm:flex-col items-start sm:items-end gap-1">
        {branchesOf(user).map((branch) => (
          <span
            key={branch}
            className="inline-flex items-center gap-1.5 h-6 px-2 rounded-full border border-[#E8E9EE] bg-white text-[11px] font-semibold text-[#17181D] whitespace-nowrap max-w-full"
          >
            <Store className="w-3 h-3 text-[#9CA1A9] shrink-0" />
            <span className="truncate">{branch}</span>
          </span>
        ))}
      </span>
    )}

    <span className="text-[11px] text-[#9CA1A9] whitespace-nowrap hidden lg:block tabular-nums">
      Added {formatDate(user.createdAt)}
    </span>

    {/*
      Actions stay visible on touch, where there is no hover to reveal them —
      dimmed until pointed at rather than hidden, so a row never looks inert.
    */}
    <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
      <button
        type="button"
        onClick={onEdit}
        title={`Edit ${user.name}`}
        aria-label={`Edit ${user.name}`}
        className={`${ROW_ACTION} hover:text-[#17181D] hover:bg-white hover:border-[#E4E6EB] hover:shadow-xs`}
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>

      {user.active ? (
        <button
          type="button"
          onClick={onRemove}
          title={`Withdraw ${user.name}`}
          aria-label={`Withdraw ${user.name}`}
          className={`${ROW_ACTION} hover:text-[#C8202D] hover:bg-[#FDECEE]`}
        >
          <UserX className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onRestore}
          title={`Restore ${user.name}`}
          aria-label={`Restore ${user.name}`}
          className={`${ROW_ACTION} hover:text-[#157F4B] hover:bg-[#EAF6EF]`}
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  </li>
);

/** A text field with a leading icon: rounded, and a red ring when it has focus. */
const FIELD =
  'w-full h-11 pl-10 pr-3 bg-white border border-[#E4E6EB] rounded-xl text-[13px] text-[#17181D] placeholder:text-[#9CA1A9] shadow-xs focus:outline-none focus:border-[#C8202D] focus:ring-4 focus:ring-[#C8202D]/10 transition-[border-color,box-shadow]';
const LABEL = 'block text-xs font-semibold text-[#17181D] mb-1.5';
const HINT = 'mt-1.5 text-[11px] text-[#9CA1A9]';

const IconField: React.FC<{
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}> = ({ icon: Icon, children }) => (
  <div className="relative">
    <Icon className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[#9CA1A9]" />
    {children}
  </div>
);

/** Add or edit, in one form — the fields are the same either way. */
const UserForm: React.FC<{
  draft: UserDraft;
  editingExisting: User | null;
  branches: string[];
  error: string | null;
  onChange: (draft: UserDraft) => void;
  onSave: () => void;
  onCancel: () => void;
}> = ({ draft, editingExisting, branches, error, onChange, onSave, onCancel }) => (
  <Reveal>
    <form
      id="user-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <Card className="overflow-hidden ring-1 ring-[#C8202D]/10">
        <div className="px-5 sm:px-6 py-4 border-b border-[#F0F1F4] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-[#FDECEE] text-[#C8202D] flex items-center justify-center shrink-0">
              {editingExisting ? <Pencil className="w-4 h-4" /> : <Plus className="w-[18px] h-[18px]" />}
            </span>
            <div className="min-w-0">
              <h3 className="text-[15px] font-bold text-[#17181D] truncate">
                {editingExisting ? `Edit ${editingExisting.name}` : 'Add a user'}
              </h3>
              <p className="text-xs text-[#6B6F76] mt-0.5 truncate">
                {editingExisting ? 'Changes apply the next time they sign in' : 'Choose a role, then who they are'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancel"
            className="w-8 h-8 rounded-lg flex items-center justify-center text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F4F5F7] transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 sm:px-6 py-5 space-y-6">
          {/* Role first: it decides whether the branch field below applies */}
          <div>
            <span className={LABEL}>Role</span>

            {editingExisting?.role === 'admin' ? (
              /*
               * The main admin's own account. Its role is not up for changing
               * here — demoting the only admin would leave nobody able to
               * manage anything, this screen included.
               */
              <>
                <p className="inline-flex items-center gap-2 h-10 px-3.5 rounded-xl bg-[#F4F5F7] text-[12px] font-bold text-[#17181D]">
                  <ShieldCheck className="w-4 h-4 text-[#C8202D]" />
                  {USER_ROLE_LABEL.admin}
                  <span className="font-semibold text-[#6B6F76]">— cannot be changed</span>
                </p>
                <p className={HINT}>{USER_ROLE_BLURB[draft.role]}</p>
              </>
            ) : (
              /*
               * Segmented cards rather than a dropdown, each carrying what the
               * role can reach — the consequence of the choice is read at the
               * moment of making it.
               */
              <div className="grid gap-2.5 sm:grid-cols-3">
                {MANAGED_ROLES.map((role) => {
                  const Icon = ROLE_ICON[role];
                  const selected = draft.role === role;
                  return (
                    <button
                      key={role}
                      type="button"
                      id={`user-form-role-${role}`}
                      onClick={() =>
                        onChange({
                          ...draft,
                          role,
                          // A branch on an inspector means nothing, and leaving a
                          // stale one behind would save it
                          branchNames: role === 'branch-manager' ? draft.branchNames : undefined,
                        })
                      }
                      aria-pressed={selected}
                      className={`relative text-left p-3.5 rounded-xl border transition-all cursor-pointer focus:outline-none focus-visible:ring-4 focus-visible:ring-[#C8202D]/15 ${
                        selected
                          ? 'border-[#C8202D] bg-[#FFF7F8] shadow-[0_0_0_1px_#C8202D]'
                          : 'border-[#E4E6EB] bg-white hover:border-[#D0D3D9] hover:-translate-y-px hover:shadow-sm'
                      }`}
                    >
                      <span className="flex items-center gap-2.5">
                        <span
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                            selected ? 'bg-[#C8202D] text-white' : 'bg-[#F4F5F7] text-[#6B6F76]'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </span>
                        <span className="text-[13px] font-bold text-[#17181D] flex-1 min-w-0">
                          {USER_ROLE_LABEL[role]}
                        </span>
                        <span
                          className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${
                            selected ? 'border-[#C8202D] bg-[#C8202D] text-white' : 'border-[#D0D3D9] bg-white'
                          }`}
                        >
                          {selected && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
                        </span>
                      </span>
                      <span className="mt-2 block text-[11px] leading-snug text-[#6B6F76]">
                        {USER_ROLE_BLURB[role]}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className={LABEL} htmlFor="user-form-name">
                Full name
              </label>
              <IconField icon={UserRound}>
                <input
                  id="user-form-name"
                  type="text"
                  value={draft.name}
                  onChange={(e) => onChange({ ...draft, name: e.target.value })}
                  placeholder="e.g. Ali Barakat"
                  className={FIELD}
                  autoFocus
                />
              </IconField>
            </div>

            <div>
              <label className={LABEL} htmlFor="user-form-email">
                Email or username — their sign-in
              </label>
              <IconField icon={Mail}>
                <input
                  id="user-form-email"
                  type="text"
                  value={draft.email}
                  onChange={(e) => onChange({ ...draft, email: e.target.value })}
                  placeholder="e.g. AliBarakat or name@royalgujrat.com"
                  className={FIELD}
                  autoComplete="off"
                />
              </IconField>
              {/\s/.test(draft.email.trim()) && (
                <p className="mt-1.5 text-[11px] text-[#6B6F76]">
                  Spaces are left out — they sign in as{' '}
                  <strong className="text-[#17181D]">{draft.email.replace(/\s+/g, '')}</strong>
                </p>
              )}
            </div>

            <div>
              <label className={LABEL} htmlFor="user-form-password">
                Password
              </label>
              <IconField icon={KeyRound}>
                <input
                  id="user-form-password"
                  type="text"
                  value={draft.password}
                  onChange={(e) => onChange({ ...draft, password: e.target.value })}
                  placeholder="Set a password to give them"
                  className={FIELD}
                  autoComplete="off"
                />
              </IconField>
              {/*
                Shown rather than masked, and stated plainly: the admin is setting
                a password to hand over, so hiding it from the person typing it
                would only mean typing it twice.
              */}
              <p className={HINT}>Visible so you can pass it on. Demo system — not encrypted.</p>
            </div>

            {draft.role === 'branch-manager' && (
              <fieldset className="sm:col-span-2">
                <legend className={LABEL}>Branches they run</legend>
                {/*
                  Checkboxes rather than a dropdown: some managers run two
                  branches side by side, from the one account. Drawn as tiles,
                  with the real checkbox kept inside each for the keyboard and
                  for the label click that toggles it.
                */}
                <div id="user-form-branch" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {branches.map((name) => {
                    const chosen = draft.branchNames ?? [];
                    const checked = chosen.includes(name);
                    return (
                      <label
                        key={name}
                        className={`flex items-center gap-3 px-3.5 h-11 rounded-xl border text-[12px] cursor-pointer transition-all has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[#C8202D]/15 ${
                          checked
                            ? 'border-[#C8202D] bg-[#FFF7F8] text-[#17181D] font-semibold shadow-[0_0_0_1px_#C8202D]'
                            : 'border-[#E4E6EB] bg-white text-[#17181D] hover:border-[#D0D3D9] hover:shadow-sm'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {
                            const next = checked
                              ? chosen.filter((b) => b !== name)
                              : [...chosen, name];
                            onChange({ ...draft, branchNames: next.length > 0 ? next : undefined });
                          }}
                          className="sr-only"
                        />
                        <span
                          aria-hidden
                          className={`w-[18px] h-[18px] rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                            checked ? 'bg-[#C8202D] border-[#C8202D] text-white' : 'bg-white border-[#D0D3D9]'
                          }`}
                        >
                          {checked && <Check className="w-3 h-3" strokeWidth={3} />}
                        </span>
                        <Store className={`w-3.5 h-3.5 shrink-0 ${checked ? 'text-[#C8202D]' : 'text-[#9CA1A9]'}`} />
                        <span className="truncate">{name}</span>
                      </label>
                    );
                  })}
                </div>
                <p className={HINT}>
                  This is the whole of their access — records and inspections for these branches only.
                </p>
              </fieldset>
            )}
          </div>
        </div>

        <div className="px-5 sm:px-6 py-4 border-t border-[#F0F1F4] bg-[#FAFBFC]">
          {/*
            Beside the button rather than at the top of the form: the form is long
            enough to scroll, and a refusal printed above the fold read as the
            button doing nothing.
          */}
          {error && (
            <div
              id="user-form-error"
              role="alert"
              className="mb-3 px-3 py-2.5 rounded-xl bg-[#FDECEE] border border-[#C8202D]/20 text-[#A81823] text-xs font-semibold flex items-center gap-2"
            >
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-2 justify-end">
            <button type="button" onClick={onCancel} className={BUTTON.secondary}>
              Cancel
            </button>
            <button type="submit" id="user-form-save" className={BUTTON.primary}>
              <Check className="w-4 h-4" />
              {editingExisting ? 'Save changes' : 'Create account'}
            </button>
          </div>
        </div>
      </Card>
    </form>
  </Reveal>
);

/**
 * Confirms withdrawing an account, saying which of the two outcomes is about
 * to happen — deleted outright, or kept for the sake of its history. They
 * are different enough that a single "are you sure" would be a lie about one
 * of them.
 */
const RemovalDialog: React.FC<{
  user: User;
  usage: { submitted: number; assigned: number };
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ user, usage, onCancel, onConfirm }) => {
  const referenced = usage.submitted > 0 || usage.assigned > 0;
  const dialogRef = useDialog<HTMLDivElement>(onCancel);

  return (
    /*
     * The scrim only fades. The panel inside may scale, but nothing above a
     * `position: fixed` element may carry a transform, or it stops being fixed
     * to the window.
     */
    <motion.div
      ref={dialogRef}
      className="fixed inset-0 z-50 bg-[#17181D]/45 backdrop-blur-[2px] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-removal-title"
      onClick={onCancel}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: t(0.2) }}
    >
      <motion.div
        className="bg-white rounded-2xl border border-[#E8E9EE] shadow-[0_24px_64px_-16px_rgba(16,24,40,0.35)] w-full max-w-md overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: t(0.3), ease: EASE_OUT }}
      >
        <div className="px-6 pt-6 flex items-start gap-3.5">
          <span className="w-10 h-10 rounded-xl bg-[#FDECEE] text-[#C8202D] flex items-center justify-center shrink-0">
            {referenced ? <Shield className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          </span>
          <div className="min-w-0 flex-1">
            <h3 id="user-removal-title" className="text-base font-bold text-[#17181D] pt-2">
              {referenced ? `Withdraw ${user.name}?` : `Remove ${user.name}?`}
            </h3>
            <p className="mt-1.5 text-[13px] text-[#6B6F76] leading-relaxed">
              {referenced ? (
                <>
                  They will no longer be able to sign in. Their name stays on the{' '}
                  <span className="font-semibold text-[#17181D]">
                    {usage.submitted} inspection{usage.submitted === 1 ? '' : 's'}
                  </span>{' '}
                  they submitted, so those records still read correctly.
                </>
              ) : (
                <>
                  This account has never submitted an inspection, so it is deleted outright.
                  This cannot be undone.
                </>
              )}
            </p>

            {usage.assigned > 0 && (
              <p className="mt-3 px-3 py-2.5 rounded-xl bg-[#FDF3E2] border border-[#B4740A]/20 text-[12px] text-[#8A5A08] font-semibold">
                {usage.assigned} surprise visit{usage.assigned === 1 ? '' : 's'} assigned to them
                {usage.assigned === 1 ? ' is' : ' are'} still unstarted — reassign
                {usage.assigned === 1 ? ' it' : ' them'} to someone else.
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 px-6 py-4 border-t border-[#F0F1F4] bg-[#FAFBFC] flex flex-wrap gap-2 justify-end">
          <button type="button" onClick={onCancel} className={BUTTON.secondary}>
            Keep account
          </button>
          <button type="button" id="user-removal-confirm" onClick={onConfirm} className={BUTTON.primary}>
            {referenced ? 'Withdraw access' : 'Remove account'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
