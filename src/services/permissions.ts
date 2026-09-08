import { Inspection, User, UserRole, inspectionKindOf } from '../types';

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
  /** Every inspection in the system, whoever carried it out. */
  | 'inspections.viewAll'
  /** The maintenance module: jobs, repeats, reports. */
  | 'maintenance.view'
  /** Create, edit and reorder the checklist itself. */
  | 'checklist.manage'
  /** Add, edit and withdraw user accounts. */
  | 'users.manage'
  /** Add and remove branches. */
  | 'branches.manage'
  /** Raise a surprise visit and hand it to an inspector. */
  | 'surprise.create'
  /** Start the branch's own weekly round. */
  | 'monday.perform'
  /** Reopen a submitted result and change its answers. */
  | 'inspection.editSubmitted';

/**
 * The permission table.
 *
 * Written out per role rather than derived from a hierarchy, because these
 * three roles do not nest: an inspector may submit a visit at any branch,
 * which a branch manager may not, while a branch manager sees a dashboard,
 * which an inspector may not. Any ordering that produced both would be a
 * coincidence rather than a rule.
 */
const GRANTS: Record<UserRole, Capability[]> = {
  // "The Main Admin is the highest-level user and has full control."
  admin: [
    'dashboard.viewOwnBranch',
    'inspections.viewAll',
    'maintenance.view',
    'checklist.manage',
    'users.manage',
    'branches.manage',
    'surprise.create',
    'monday.perform',
    'inspection.editSubmitted',
  ],

  // Their branch, and its Monday round. Not the checklist, not other
  // branches, not accounts, and not a submitted result once it is signed.
  'branch-manager': ['dashboard.viewOwnBranch', 'monday.perform'],

  // "The Inspector can only complete the inspection assigned to them."
  // No dashboard at all — the spec puts the admin dashboard out of reach,
  // and a branch dashboard would be meaningless for someone with no branch.
  inspector: [],
};

export function can(user: User | null, capability: Capability): boolean {
  if (!user || !user.active) return false;
  return GRANTS[user.role].includes(capability);
}

// ---------------------------------------------------------------------------
// Record-level rules
// ---------------------------------------------------------------------------

/**
 * Whether this person is allowed to see a record at all.
 *
 * A branch manager sees their branch, whoever inspected it — including the
 * surprise visits, since the findings are theirs to act on. An inspector
 * sees only the visits handed to them: they have no standing at a branch
 * beyond the visit itself.
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
 * before the section's. Routes absent from here are open to anyone signed in
 * — the inspection screens are, because they guard themselves per record:
 * which visits you may open is a question about the record, not the URL.
 */
const ROUTE_RULES: { prefix: string; capability: Capability }[] = [
  { prefix: '/dashboard', capability: 'dashboard.viewOwnBranch' },
  { prefix: '/maintenance', capability: 'maintenance.view' },
  { prefix: '/checklist', capability: 'checklist.manage' },
  { prefix: '/users', capability: 'users.manage' },
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

  const rule = ROUTE_RULES.filter(
    (r) => pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)
  ).sort((a, b) => b.prefix.length - a.prefix.length)[0];

  return rule ? can(user, rule.capability) : true;
}

/**
 * Where signing in lands, and where a blocked route redirects to.
 *
 * The dashboard for anyone who has one. An inspector does not, so their home
 * is the list of visits they have been given — which is the whole of their
 * job in the system.
 */
export function homePathFor(user: User | null): string {
  if (!user) return '/login';
  return can(user, 'dashboard.viewOwnBranch') ? '/dashboard' : '/inspections';
}
