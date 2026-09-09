import { Inspection, User, UserRole, inspectionKindOf } from '../types';
import { getJobs } from './maintenanceStore';

/**
 * Who may do what.
 *
 * One module, listing each permission by name, so the rules can be read
 * against the spec they came from instead of being pieced together from
 * conditions scattered across screens. Everything that hides a button or
 * guards a route asks a question here.
 *
 * Two shapes of question, because two shapes exist:
 *
 *   can(user, capability)        may this person do this *kind* of thing
 *   canEditInspection(user, i)   may they do it to *this record*
 *
 * The second cannot be folded into the first: whether an inspection may be
 * edited depends on whether it has been submitted, and by whom.
 *
 * This is a client-side app with its records in localStorage, so these are
 * rules about what the interface offers, not a security boundary — anyone
 * with the browser console can rewrite storage directly. When a server
 * arrives it has to enforce the same list again on its side.
 */

export type Capability =
  /**
   * A dashboard at all. Held by the admin, whose dashboard covers every
   * branch, and by a branch manager, whose covers theirs — the screen
   * narrows itself by what `visibleInspections` returns, so one capability
   * answers both. An inspector has no dashboard of any kind.
   */
  | 'dashboard.viewOwnBranch'
  /**
   * The inspections list — the screen, and the sidebar row that leads to it.
   *
   * Only the list. Which individual records you may open is a separate
   * question, answered per record by `canViewInspection`, and the report
   * screens ask it themselves. The distinction earns its keep for the job
   * manager, who has no list worth showing — theirs would scope itself to
   * nothing — but may still open the one record that raised a job of theirs.
   */
  | 'inspections.browse'
  /** Every inspection in the system, whoever carried it out. */
  | 'inspections.viewAll'
  /**
   * The maintenance module: jobs, repeats, reports — and acting on them,
   * since anyone who can open the board can start and finish the work on it.
   * Held by the admin and by the job manager, whose whole remit this is.
   */
  | 'maintenance.view'
  /** Create, edit and reorder the checklist itself. */
  | 'checklist.manage'
  /** Add, edit and withdraw user accounts. */
  | 'users.manage'
  /** Add and remove branches. */
  | 'branches.manage'
  /** Raise a surprise visit and hand it to an inspector. */
  | 'surprise.create'
  /**
   * Change the system-wide switches in services/settings.ts — which is only
   * whether the system may place a surprise visit itself. Held by the admin
   * alone: everyone is subject to these, so one person decides them.
   */
  | 'settings.manage'
  /** Start the branch's own weekly round. */
  | 'monday.perform'
  /** Reopen a submitted result and change its answers. */
  | 'inspection.editSubmitted';

/**
 * The permission table.
 *
 * Written out per role rather than derived from a hierarchy, because these
 * roles do not nest: an inspector may submit a visit at any branch, which a
 * branch manager may not, while a branch manager sees a dashboard, which an
 * inspector may not — and a job manager works across every branch while
 * being shown none of their inspections. Any ordering that produced all of
 * that would be a coincidence rather than a rule.
 */
const GRANTS: Record<UserRole, Capability[]> = {
  // "The Main Admin is the highest-level user and has full control." Which
  // includes the maintenance board: the job manager's remit is a subset of
  // the admin's, never a slice carved out of it.
  admin: [
    'dashboard.viewOwnBranch',
    'inspections.browse',
    'inspections.viewAll',
    'maintenance.view',
    'checklist.manage',
    'users.manage',
    'branches.manage',
    'surprise.create',
    'settings.manage',
    'monday.perform',
    'inspection.editSubmitted',
  ],

  // Their branch, and its Monday round. Not the checklist, not other
  // branches, not accounts, and not a submitted result once it is signed.
  'branch-manager': ['dashboard.viewOwnBranch', 'inspections.browse', 'monday.perform'],

  /*
   * The maintenance board, and nothing else.
   *
   * Estate-wide, because a repair is not a branch's private business — the
   * same contractor and the same budget cover all four. But no inspections:
   * they raise the jobs and are none of the job manager's concern once
   * raised, and everything the work needs is copied onto the job itself.
   *
   * No dashboard either. The maintenance overview is their dashboard, and it
   * is the one they are sent to on sign-in — see `homePathFor`.
   */
  'job-manager': ['maintenance.view'],

  // "The Inspector can only complete the inspection assigned to them."
  // No dashboard at all — the spec puts the admin dashboard out of reach,
  // and a branch dashboard would be meaningless for someone with no branch.
  inspector: ['inspections.browse'],
};

export function can(user: User | null, capability: Capability): boolean {
  if (!user || !user.active) return false;
  return GRANTS[user.role].includes(capability);
}

// ---------------------------------------------------------------------------
// Record-level rules
// ---------------------------------------------------------------------------

/**
 * Whether this inspection put anything on the maintenance board.
 *
 * The one rule here that reads state rather than the table above, because the
 * question it answers is genuinely about data: a job manager's standing at a
 * record comes from the work it raised, not from who they are. A server
 * enforcing this list would do the same join.
 */
function raisedMaintenanceWork(inspectionId: string): boolean {
  return getJobs().some((job) => job.sourceInspectionId === inspectionId);
}

/**
 * Whether this person is allowed to see a record at all.
 *
 * A branch manager sees their branch, whoever inspected it — including the
 * surprise visits, since the findings are theirs to act on. An inspector
 * sees only the visits handed to them: they have no standing at a branch
 * beyond the visit itself.
 *
 * A job manager sees the records that raised work they hold, and no others.
 * The board is theirs in full, and a repair whose origin they cannot read is
 * a repair they have to take on trust — the finding says which unit, what
 * was wrong and how urgent, and the rest of the report is the context for
 * judging it. Narrow because the disclosure is earned by the job: an
 * inspection that raised nothing is simply not their business.
 */
export function canViewInspection(user: User | null, inspection: Inspection): boolean {
  if (!user || !user.active) return false;
  if (can(user, 'inspections.viewAll')) return true;

  if (user.role === 'branch-manager') {
    return inspection.branchName === user.branchName;
  }

  if (user.role === 'inspector') {
    return inspection.assignedToUserId === user.id;
  }

  if (user.role === 'job-manager') {
    return raisedMaintenanceWork(inspection.id);
  }

  return false;
}

/** The records a person may see, in the order they were given. */
export function visibleInspections(user: User | null, all: Inspection[]): Inspection[] {
  if (!user || !user.active) return [];
  if (can(user, 'inspections.viewAll')) return all;
  return all.filter((i) => canViewInspection(user, i));
}

/**
 * Whether this person may fill in and submit a record.
 *
 * The kind of visit decides it. A Monday round belongs to the branch's own
 * manager; a surprise visit belongs to the inspector it was assigned to and
 * nobody else, which is the point of assigning it. The admin may carry out
 * either, since they can already change the result afterwards — withholding
 * the ability to fill one in would be a limit with nothing behind it.
 */
export function canPerformInspection(user: User | null, inspection: Inspection): boolean {
  if (!user || !user.active) return false;
  if (inspection.status === 'submitted') return false;
  if (user.role === 'admin') return true;

  if (inspectionKindOf(inspection) === 'surprise') {
    return user.role === 'inspector' && inspection.assignedToUserId === user.id;
  }

  return (
    user.role === 'branch-manager' &&
    inspection.branchName === user.branchName &&
    can(user, 'monday.perform')
  );
}

/**
 * Whether the answers may be changed.
 *
 * Before submission this is the same question as who may carry the visit
 * out. After it, the record is locked and only the main admin can reopen it
 * — which is the whole guarantee the lock makes, and why every override is
 * appended to `edits` where the report can print it.
 */
export function canEditInspection(user: User | null, inspection: Inspection): boolean {
  if (!user || !user.active) return false;
  if (inspection.status === 'submitted') return can(user, 'inspection.editSubmitted');
  return canPerformInspection(user, inspection);
}

/**
 * The branch a person is allowed to file an inspection against, when they do
 * not get to choose. `null` means they choose from the open branches.
 *
 * "Inspector cannot choose their own inspection branch" — theirs comes from
 * the assignment, so this is only asked for the roles that start a visit
 * from the form.
 */
export function fixedBranchFor(user: User | null): string | null {
  if (user?.role === 'branch-manager' && user.branchName) return user.branchName;
  return null;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

/**
 * Every route behind sign-in, and the capability it needs.
 *
 * Longest prefix wins, so `/maintenance/jobs` is matched by its own entry
 * before the section's, and `/inspections/new` before `/inspections`.
 *
 * A rule here is the coarse question of whose area a URL belongs to. Which
 * records you may open once inside is a finer one the inspection screens
 * answer for themselves, per record, through `canViewInspection`.
 */
const ROUTE_RULES: { prefix: string; capability: Capability; exact?: boolean }[] = [
  { prefix: '/dashboard', capability: 'dashboard.viewOwnBranch' },
  { prefix: '/maintenance', capability: 'maintenance.view' },
  { prefix: '/checklist', capability: 'checklist.manage' },
  { prefix: '/users', capability: 'users.manage' },
  /*
   * The list, and only the list — hence `exact`. A record's own URL sits
   * under this path but is deliberately left to fall through to no rule at
   * all, because the report, review and checklist screens each ask
   * `canViewInspection` about the record in front of them, which is a finer
   * question than a prefix can put. Guarding the whole subtree here would
   * have overruled them, and shut a job manager out of the one record they
   * are entitled to.
   */
  { prefix: '/inspections', capability: 'inspections.browse', exact: true },
  /*
   * "Inspector cannot create inspections" — and `monday.perform` is held by
   * exactly the two roles that can raise one from this form, so it stands in
   * for the pair. An inspector's visits arrive already created.
   */
  { prefix: '/inspections/new', capability: 'monday.perform' },
];

/** Whether a signed-in person may open a path at all. */
export function canAccessPath(user: User | null, pathname: string): boolean {
  if (!user || !user.active) return false;

  const rule = ROUTE_RULES.filter((r) =>
    r.exact ? pathname === r.prefix : pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)
  ).sort((a, b) => b.prefix.length - a.prefix.length)[0];

  return rule ? can(user, rule.capability) : true;
}

/**
 * Where signing in lands, and where a blocked route redirects to.
 *
 * The dashboard for anyone who has one. Failing that, whichever area is the
 * whole of their job: the maintenance board for a job manager, the list of
 * visits they have been handed for an inspector.
 *
 * Ordered, not exclusive — the admin holds all three, and the dashboard is
 * the right landing for them. The rule is "the broadest view this person
 * has", and the fallback has to be an area the account can actually open,
 * which is why a job manager cannot simply be left to the inspections list:
 * the route guard above would bounce them straight back out of it.
 */
export function homePathFor(user: User | null): string {
  if (!user) return '/login';
  if (can(user, 'dashboard.viewOwnBranch')) return '/dashboard';
  if (!can(user, 'inspections.browse') && can(user, 'maintenance.view')) return '/maintenance';
  return '/inspections';
}
