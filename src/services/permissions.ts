import {
  Equipment,
  Inspection,
  MaintenanceJob,
  User,
  UserRole,
  inspectionKindOf,
} from '../types';
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
   * The maintenance module in full: every branch's jobs, the repeats, the
   * overview, the month-end report — and acting on them, since anyone who
   * runs the board starts and finishes the work on it. Held by the admin and
   * by the maintenance manager, whose whole remit this is.
   */
  | 'maintenance.view'
  /**
   * Put a problem on the maintenance board for your own branch, the day it is
   * found, and follow what happens to it afterwards.
   *
   * Separate from `maintenance.view` rather than a slice of it, because it is
   * a different standing and not a smaller one: reporting a fault is what a
   * branch does, carrying it out is what maintenance does. So this grants the
   * board — narrowed to their own branch by `visibleJobs` — and the form on
   * it, and nothing that moves a job along. See `canManageJobs`.
   *
   * Until this existed the only route onto the board was a Monday round, so a
   * chiller that failed on a Tuesday waited until the following week to be
   * written down anywhere.
   */
  | 'maintenance.reportOwnBranch'
  /**
   * The equipment register and the servicing schedule: adding an asset,
   * correcting its serial, importing the operator's appliance list, and
   * setting what each category is serviced on.
   *
   * Held by the admin and the Maintenance Manager. Deliberately not by a
   * branch manager: an interval is an estate-wide commitment about how often
   * the contractor comes, and a branch quietly setting its own chillers to
   * twelve months would be a decision about budget taken by someone who does
   * not hold it. They see their own branch's register and what is due on it,
   * which is what acting on it requires.
   */
  | 'equipment.manage'
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
 * inspector may not — and a maintenance manager works across every branch while
 * being shown none of their inspections. Any ordering that produced all of
 * that would be a coincidence rather than a rule.
 */
const GRANTS: Record<UserRole, Capability[]> = {
  // "The Main Admin is the highest-level user and has full control." Which
  // includes the maintenance board: the maintenance manager's remit is a subset of
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
    'equipment.manage',
  ],

  // Their branch: its Monday round, and its repairs — which they may raise
  // on any day, not only inspection day, since equipment does not wait for
  // the round. Not the checklist, not other branches, not accounts, not a
  // submitted result once it is signed, and not the running of the repair.
  'branch-manager': [
    'dashboard.viewOwnBranch',
    'inspections.browse',
    'monday.perform',
    'maintenance.reportOwnBranch',
  ],

  /*
   * The maintenance board, and nothing else.
   *
   * Estate-wide, because a repair is not a branch's private business — the
   * same contractor and the same budget cover all four. But no inspections:
   * they raise the jobs and are none of the maintenance manager's concern once
   * raised, and everything the work needs is copied onto the job itself.
   *
   * No dashboard either. The maintenance overview is their dashboard, and it
   * is the one they are sent to on sign-in — see `homePathFor`.
   */
  'job-manager': ['maintenance.view', 'equipment.manage'],

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
 * question it answers is genuinely about data: a maintenance manager's standing at a
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
 * A maintenance manager sees the records that raised work they hold, and no others.
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

// ---------------------------------------------------------------------------
// Maintenance jobs
// ---------------------------------------------------------------------------

/**
 * Whether this person may see a maintenance job at all.
 *
 * The module's holders see every job, at every branch, because a repair is
 * not a branch's private business — the same contractor and the same budget
 * cover all four.
 *
 * A branch manager sees the jobs at their own branch and no others: the ones
 * they raised themselves and the ones their inspections raised. Withholding
 * them would have made reporting a fault a write into the dark, with no way
 * of telling whether anyone had picked it up.
 */
export function canViewJob(user: User | null, job: MaintenanceJob): boolean {
  if (!user || !user.active) return false;
  if (can(user, 'maintenance.view')) return true;
  if (can(user, 'maintenance.reportOwnBranch')) return job.branchName === user.branchName;
  return false;
}

/** The jobs a person may see, in the order they were given. */
export function visibleJobs(user: User | null, all: MaintenanceJob[]): MaintenanceJob[] {
  if (!user || !user.active) return [];
  if (can(user, 'maintenance.view')) return all;
  return all.filter((job) => canViewJob(user, job));
}

/**
 * Whether the job board is theirs to open, and to put a problem on.
 *
 * One question rather than two, because on this board they are the same
 * standing: the board is the only place a problem is raised from, and nobody
 * should be able to raise one without being able to see what became of it.
 * What the board then *shows* them is a separate matter, settled job by job
 * by `visibleJobs`.
 */
export function canOpenJobBoard(user: User | null): boolean {
  return can(user, 'maintenance.view') || can(user, 'maintenance.reportOwnBranch');
}

/**
 * Whether this person may see an asset at all.
 *
 * The same rule the jobs follow, and deliberately the same rule rather than a
 * parallel one: an asset and the jobs raised against it are the same subject,
 * and a branch manager who could read one but not the other would be shown a
 * repair history for a chiller they are not allowed to know about.
 */
export function canViewEquipment(user: User | null, item: Equipment): boolean {
  if (!user || !user.active) return false;
  if (can(user, 'maintenance.view')) return true;
  if (can(user, 'maintenance.reportOwnBranch')) return item.branchName === user.branchName;
  return false;
}

/** The assets a person may see, in the order they were given. */
export function visibleEquipment(user: User | null, all: Equipment[]): Equipment[] {
  if (!user || !user.active) return [];
  if (can(user, 'maintenance.view')) return all;
  return all.filter((item) => canViewEquipment(user, item));
}

/** Whether they may add, correct, import or withdraw assets and edit plans. */
export function canManageEquipment(user: User | null): boolean {
  return can(user, 'equipment.manage');
}

/**
 * Whether they may move a job along: start it, end it, correct its times,
 * reopen it or delete it.
 *
 * Maintenance's work, not the reporting branch's. A branch manager who could
 * close their own jobs could mark a repair done that nobody carried out —
 * which is the one thing the board exists to make impossible to hide. So they
 * report and they watch, and the board is moved by the people who run it.
 */
export function canManageJobs(user: User | null): boolean {
  return can(user, 'maintenance.view');
}

// ---------------------------------------------------------------------------
// Filing
// ---------------------------------------------------------------------------

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
const ROUTE_RULES: { prefix: string; anyOf: Capability[]; exact?: boolean }[] = [
  { prefix: '/dashboard', anyOf: ['dashboard.viewOwnBranch'] },
  /*
   * The overview and the month-end report are the whole estate at a glance,
   * so they stay with the module's holders. `exact` on the section root is
   * what leaves a single job's URL to fall through to no rule at all — the
   * same arrangement, and for the same reason, as a record's URL under
   * /inspections: whether you may open one job depends on its branch, which
   * is a finer question than a prefix can put, so MaintenanceJobScreen asks
   * `canViewJob` about the job in front of it.
   */
  { prefix: '/maintenance', anyOf: ['maintenance.view'], exact: true },
  { prefix: '/maintenance/report', anyOf: ['maintenance.view'] },
  /*
   * The board is the one maintenance screen a branch manager reaches, because
   * it is where a problem is raised and where they follow what became of it.
   * They do not find the estate on it: `visibleJobs` narrows it to their own
   * branch before the screen renders a row.
   */
  { prefix: '/maintenance/jobs', anyOf: ['maintenance.view', 'maintenance.reportOwnBranch'] },
  /*
   * The register, narrowed to their own branch for a branch manager by
   * `visibleEquipment` exactly as the board is. Reading what equipment a
   * branch has and when it is next serviced is part of running it; changing
   * the register or the intervals is `equipment.manage`, which the screen
   * asks for itself rather than the route asking on its behalf.
   */
  { prefix: '/maintenance/equipment', anyOf: ['maintenance.view', 'maintenance.reportOwnBranch'] },
  /*
   * The schedule is estate-wide configuration — what every branch's chillers
   * are serviced on — so unlike the register it is not a branch's to open.
   */
  { prefix: '/maintenance/schedule', anyOf: ['equipment.manage'] },
  { prefix: '/checklist', anyOf: ['checklist.manage'] },
  { prefix: '/users', anyOf: ['users.manage'] },
  /*
   * The list, and only the list — hence `exact`. A record's own URL sits
   * under this path but is deliberately left to fall through to no rule at
   * all, because the report, review and checklist screens each ask
   * `canViewInspection` about the record in front of them, which is a finer
   * question than a prefix can put. Guarding the whole subtree here would
   * have overruled them, and shut a maintenance manager out of the one record they
   * are entitled to.
   */
  { prefix: '/inspections', anyOf: ['inspections.browse'], exact: true },
  /*
   * "Inspector cannot create inspections" — and `monday.perform` is held by
   * exactly the two roles that can raise one from this form, so it stands in
   * for the pair. An inspector's visits arrive already created.
   */
  { prefix: '/inspections/new', anyOf: ['monday.perform'] },
];

/** Whether a signed-in person may open a path at all. */
export function canAccessPath(user: User | null, pathname: string): boolean {
  if (!user || !user.active) return false;

  const rule = ROUTE_RULES.filter((r) =>
    r.exact ? pathname === r.prefix : pathname === r.prefix || pathname.startsWith(`${r.prefix}/`)
  ).sort((a, b) => b.prefix.length - a.prefix.length)[0];

  // Any one of the listed capabilities opens the path: a route can belong to
  // more than one standing, as the job board belongs both to the people who
  // run maintenance and to the branch that reports into it.
  return rule ? rule.anyOf.some((capability) => can(user, capability)) : true;
}

/**
 * Where signing in lands, and where a blocked route redirects to.
 *
 * The dashboard for anyone who has one. Failing that, whichever area is the
 * whole of their job: the maintenance board for a maintenance manager, the list of
 * visits they have been handed for an inspector.
 *
 * Ordered, not exclusive — the admin holds all three, and the dashboard is
 * the right landing for them. The rule is "the broadest view this person
 * has", and the fallback has to be an area the account can actually open,
 * which is why a maintenance manager cannot simply be left to the inspections list:
 * the route guard above would bounce them straight back out of it.
 */
export function homePathFor(user: User | null): string {
  if (!user) return '/login';
  if (can(user, 'dashboard.viewOwnBranch')) return '/dashboard';
  if (!can(user, 'inspections.browse') && can(user, 'maintenance.view')) return '/maintenance';
  return '/inspections';
}
