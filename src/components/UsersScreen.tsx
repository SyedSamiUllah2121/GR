'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Pencil,
  Plus,
  RotateCcw,
  Shield,
  ShieldCheck,
  Store,
  UserRound,
  UserX,
  X,
} from 'lucide-react';
import {
  USER_ROLE_BLURB,
  USER_ROLE_KEYS,
  USER_ROLE_LABEL,
  User,
  UserRole,
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
import { useUsers } from '../hooks/useUsers';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { formatDate } from '../services/reportModel';

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
  inspector: UserRound,
};

/** An empty form, for a role the admin has already chosen from the group. */
const blankDraft = (role: UserRole): UserDraft => ({
  name: '',
  email: '',
  password: '',
  role,
  branchName: undefined,
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
        branchName: user.branchName,
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

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="min-h-[5rem] bg-white border-b border-[#E6E7EB] flex flex-col sm:flex-row sm:items-center justify-between px-6 md:px-10 shrink-0 gap-4 py-4 sm:py-0">
        <div>
          <h2 className="text-xl font-bold text-[#17181D]">Users &amp; access</h2>
          <p className="text-[#6B6F76] text-xs mt-0.5">
            {users.filter((u) => u.active).length} active account
            {users.filter((u) => u.active).length === 1 ? '' : 's'} across{' '}
            {ROLE_ORDER.length} roles
          </p>
        </div>

        <button
          type="button"
          id="users-add-btn"
          onClick={() => startAdd('branch-manager')}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-bold rounded-md transition-colors shadow-xs whitespace-nowrap self-start sm:self-auto cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Add user</span>
        </button>
      </header>

      <div className="p-6 md:p-10 flex-1 flex flex-col gap-5">
        {notice && (
          <div
            id="users-notice"
            role="status"
            className="p-3 rounded-xl bg-[#EAF6EF] border border-[#157F4B]/25 text-[#12643C] text-xs font-semibold flex items-center gap-2"
          >
            <Check className="w-4 h-4 shrink-0" />
            <span className="flex-1">{notice}</span>
            <button
              type="button"
              onClick={() => setNotice(null)}
              aria-label="Dismiss"
              className="p-0.5 rounded hover:bg-[#157F4B]/10 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {editing && (
          <UserForm
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

        {grouped.map(({ role, members }) => {
          const Icon = ROLE_ICON[role];
          return (
            <section
              key={role}
              id={`users-group-${role}`}
              className="bg-white border border-[#E6E7EB] rounded-xl overflow-hidden"
            >
              <div className="px-5 py-4 border-b border-[#EFEFF2] flex items-center gap-3">
                <span className="w-9 h-9 rounded-lg bg-[#FDECEE] text-[#C8202D] flex items-center justify-center shrink-0">
                  <Icon className="w-[18px] h-[18px]" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-bold text-[#17181D]">
                    {USER_ROLE_LABEL[role]}
                    <span className="ml-2 text-[11px] font-semibold text-[#6B6F76]">
                      {members.filter((u) => u.active).length}
                    </span>
                  </h3>
                  <p className="text-[11px] text-[#6B6F76] mt-0.5">{USER_ROLE_BLURB[role]}</p>
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
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-[#E6E7EB] text-[11px] font-bold text-[#17181D] hover:border-[#C8202D]/40 hover:text-[#C8202D] transition-colors cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add
                  </button>
                )}
              </div>

              {members.length === 0 ? (
                <p className="px-5 py-6 text-xs text-[#9CA1A9]">
                  No {USER_ROLE_LABEL[role].toLowerCase()} accounts yet.
                </p>
              ) : (
                <ul className="divide-y divide-[#EFEFF2]">
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
            </section>
          );
        })}
      </div>

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

/** One account. */
const UserRow: React.FC<{
  user: User;
  isSelf: boolean;
  onEdit: () => void;
  onRemove: () => void;
  onRestore: () => void;
}> = ({ user, isSelf, onEdit, onRemove, onRestore }) => (
  <li
    className={`px-5 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 group ${
      user.active ? '' : 'bg-[#FBFBFC]'
    }`}
  >
    <span
      className={`w-9 h-9 rounded-full text-[11px] font-bold flex items-center justify-center shrink-0 ${
        user.active ? 'bg-[#C8202D] text-white' : 'bg-[#E6E7EB] text-[#9CA1A9]'
      }`}
    >
      {user.initials}
    </span>

    <div className="min-w-0 flex-1">
      <p className="text-[13px] font-bold text-[#17181D] flex items-center gap-2 flex-wrap">
        <span className="truncate">{user.name}</span>
        {isSelf && (
          <span className="px-1.5 py-0.5 rounded bg-[#FDECEE] text-[#C8202D] text-[10px] font-bold uppercase tracking-wide">
            You
          </span>
        )}
        {!user.active && (
          <span className="px-1.5 py-0.5 rounded bg-[#E6E7EB] text-[#6B6F76] text-[10px] font-bold uppercase tracking-wide">
            Withdrawn
          </span>
        )}
      </p>
      <p className="text-[11px] text-[#6B6F76] truncate">{user.email}</p>
    </div>

    {user.branchName && (
      <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#F6F6F8] text-[11px] font-semibold text-[#17181D] whitespace-nowrap">
        <Store className="w-3 h-3 text-[#6B6F76]" />
        {user.branchName}
      </span>
    )}

    <span className="text-[11px] text-[#9CA1A9] whitespace-nowrap hidden lg:block">
      Added {formatDate(user.createdAt)}
    </span>

    {/*
      Actions stay visible on touch, where there is no hover to reveal them —
      dimmed until pointed at rather than hidden, so a row never looks inert.
    */}
    <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
      <button
        type="button"
        onClick={onEdit}
        title={`Edit ${user.name}`}
        aria-label={`Edit ${user.name}`}
        className="p-1.5 rounded-md text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F6F6F8] transition-colors cursor-pointer"
      >
        <Pencil className="w-3.5 h-3.5" />
      </button>

      {user.active ? (
        <button
          type="button"
          onClick={onRemove}
          title={`Withdraw ${user.name}`}
          aria-label={`Withdraw ${user.name}`}
          className="p-1.5 rounded-md text-[#6B6F76] hover:text-[#C8202D] hover:bg-[#FDECEE] transition-colors cursor-pointer"
        >
          <UserX className="w-3.5 h-3.5" />
        </button>
      ) : (
        <button
          type="button"
          onClick={onRestore}
          title={`Restore ${user.name}`}
          aria-label={`Restore ${user.name}`}
          className="p-1.5 rounded-md text-[#6B6F76] hover:text-[#157F4B] hover:bg-[#EAF6EF] transition-colors cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  </li>
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
}> = ({ draft, editingExisting, branches, error, onChange, onSave, onCancel }) => {
  const field =
    'w-full px-3 py-2 bg-white border border-[#E6E7EB] rounded-lg text-[13px] text-[#17181D] placeholder:text-[#9CA1A9] focus:outline-none focus:border-[#C8202D] focus:ring-2 focus:ring-[#C8202D]/12 transition-colors';
  const label = 'block text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-1.5';

  return (
    <form
      id="user-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
      className="bg-white border border-[#C8202D]/25 rounded-xl p-5 shadow-sm"
    >
      <div className="flex items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-bold text-[#17181D]">
          {editingExisting ? `Edit ${editingExisting.name}` : 'Add a user'}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancel"
          className="p-1 rounded-md text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F6F6F8] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {error && (
        <div
          id="user-form-error"
          role="alert"
          className="mb-4 p-2.5 rounded-lg bg-[#FDECEE] border border-[#C8202D]/25 text-[#C8202D] text-xs font-semibold flex items-center gap-2"
        >
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Role first: it decides whether the branch field below applies */}
      <div className="mb-4">
        <span className={label}>Role</span>

        {editingExisting?.role === 'admin' ? (
          /*
           * The main admin's own account. Its role is not up for changing
           * here — demoting the only admin would leave nobody able to
           * manage anything, this screen included.
           */
          <p className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-[#F6F6F8] text-[12px] font-bold text-[#17181D]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#C8202D]" />
            {USER_ROLE_LABEL.admin}
            <span className="font-semibold text-[#6B6F76]">— cannot be changed</span>
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
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
                      branchName: role === 'branch-manager' ? draft.branchName : undefined,
                    })
                  }
                  aria-pressed={selected}
                  className={`inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-[12px] font-bold transition-colors cursor-pointer ${
                    selected
                      ? 'border-[#C8202D] bg-[#FDECEE] text-[#C8202D]'
                      : 'border-[#E6E7EB] text-[#6B6F76] hover:border-[#C8202D]/40 hover:text-[#17181D]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {USER_ROLE_LABEL[role]}
                </button>
              );
            })}
          </div>
        )}

        <p className="mt-2 text-[11px] text-[#6B6F76]">{USER_ROLE_BLURB[draft.role]}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={label} htmlFor="user-form-name">
            Full name
          </label>
          <input
            id="user-form-name"
            type="text"
            value={draft.name}
            onChange={(e) => onChange({ ...draft, name: e.target.value })}
            placeholder="e.g. Imran Yousaf"
            className={field}
            autoFocus
          />
        </div>

        <div>
          <label className={label} htmlFor="user-form-email">
            Email — also their sign-in
          </label>
          <input
            id="user-form-email"
            type="text"
            value={draft.email}
            onChange={(e) => onChange({ ...draft, email: e.target.value })}
            placeholder="name@royalgujrat.com"
            className={field}
            autoComplete="off"
          />
        </div>

        <div>
          <label className={label} htmlFor="user-form-password">
            Password
          </label>
          <input
            id="user-form-password"
            type="text"
            value={draft.password}
            onChange={(e) => onChange({ ...draft, password: e.target.value })}
            placeholder="Set a password to give them"
            className={field}
            autoComplete="off"
          />
          {/*
            Shown rather than masked, and stated plainly: the admin is setting
            a password to hand over, so hiding it from the person typing it
            would only mean typing it twice.
          */}
          <p className="mt-1.5 text-[10px] text-[#9CA1A9]">
            Visible so you can pass it on. Demo system — not encrypted.
          </p>
        </div>

        {draft.role === 'branch-manager' && (
          <div>
            <label className={label} htmlFor="user-form-branch">
              Branch they run
            </label>
            <select
              id="user-form-branch"
              value={draft.branchName ?? ''}
              onChange={(e) => onChange({ ...draft, branchName: e.target.value || undefined })}
              className={field}
            >
              <option value="">Choose a branch…</option>
              {branches.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
            <p className="mt-1.5 text-[10px] text-[#9CA1A9]">
              This is the whole of their access — records and inspections for this branch only.
            </p>
          </div>
        )}
      </div>

      <div className="mt-5 pt-4 border-t border-[#EFEFF2] flex flex-wrap gap-2 justify-end">
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-md border border-[#E6E7EB] text-xs font-bold text-[#17181D] hover:bg-[#F6F6F8] transition-colors cursor-pointer"
        >
          Cancel
        </button>
        <button
          type="submit"
          id="user-form-save"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-bold transition-colors cursor-pointer"
        >
          <Check className="w-4 h-4" />
          {editingExisting ? 'Save changes' : 'Create account'}
        </button>
      </div>
    </form>
  );
};

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

  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="user-removal-title"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-3">
          <span className="w-10 h-10 rounded-xl bg-[#FDECEE] text-[#C8202D] flex items-center justify-center shrink-0">
            {referenced ? <Shield className="w-5 h-5" /> : <AlertTriangle className="w-5 h-5" />}
          </span>
          <div className="min-w-0">
            <h3 id="user-removal-title" className="text-base font-bold text-[#17181D]">
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
              <p className="mt-3 p-2.5 rounded-lg bg-[#FFF6E5] border border-[#B4740A]/25 text-[12px] text-[#8A5A08] font-semibold">
                {usage.assigned} surprise visit{usage.assigned === 1 ? '' : 's'} assigned to them
                {usage.assigned === 1 ? ' is' : ' are'} still unstarted — reassign
                {usage.assigned === 1 ? ' it' : ' them'} to someone else.
              </p>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-wrap gap-2 justify-end">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-md border border-[#E6E7EB] text-xs font-bold text-[#17181D] hover:bg-[#F6F6F8] transition-colors cursor-pointer"
          >
            Keep account
          </button>
          <button
            type="button"
            id="user-removal-confirm"
            onClick={onConfirm}
            className="px-4 py-2 rounded-md bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-bold transition-colors cursor-pointer"
          >
            {referenced ? 'Withdraw access' : 'Remove account'}
          </button>
        </div>
      </div>
    </div>
  );
};
