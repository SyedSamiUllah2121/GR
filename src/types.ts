export type ReasonGroup =
  | 'STAFF'
  | 'CLEANING'
  | 'EQUIPMENT'
  | 'SUPPLY'
  | 'FOOD'
  | 'PEST'
  | 'RECORDS'
  | 'SAFETY'
  | 'TEMPERATURE'
  /**
   * Routes straight to the maintenance board: a check in this group that is
   * answered No raises a job on submit. See services/maintenanceIntake.ts.
   */
  | 'MAINTENANCE';

export const REASON_GROUP_KEYS: ReasonGroup[] = [
  'STAFF',
  'CLEANING',
  'EQUIPMENT',
  'SUPPLY',
  'FOOD',
  'PEST',
  'RECORDS',
  'SAFETY',
  'TEMPERATURE',
  'MAINTENANCE',
];

/** How serious a failure of an item is. Ordered low -> critical. */
export type Severity = 'low' | 'medium' | 'high' | 'critical';

export const SEVERITY_KEYS: Severity[] = ['low', 'medium', 'high', 'critical'];

/**
 * A named fact about the thing a question concerns — an AC unit's serial
 * number, its make, where it is. Free-form label/value pairs rather than
 * fixed columns, because what identifies a chiller is not what identifies a
 * fire extinguisher, and every branch labels its kit differently.
 */
export interface ItemDetail {
  label: string;
  value: string;
}

export interface Item {
  /**
   * Local to the item's list while stored (1..n), rewritten to the global
   * `idBase + id` by the checklist store. Answers are keyed by the global id.
   */
  id: number;
  text: string;
  reasonGroup: ReasonGroup;
  /**
   * Inherent risk if this item fails, before the reason given and the branch's
   * own history are taken into account. See services/priority.ts.
   */
  severity: Severity;
  /**
   * Which piece of kit this question is about, when it matters. Carried onto
   * the inspector's screen so they check the right unit, and onto any
   * maintenance job the failure raises so the technician knows what to find.
   */
  details?: ItemDetail[];
  /**
   * Removed from the checklist but kept so reports that already recorded an
   * answer for it still render. Excluded from new inspections.
   */
  archived?: boolean;
}

export interface Section {
  /** Stable within its list, so edits and reorders keep their identity. */
  key: string;
  title: string;
  items: Item[];
  archived?: boolean;
}

/**
 * One checklist, e.g. kitchen hygiene. Item ids are authored locally as 1..n
 * inside each list; `idBase` is added to them so ids stay unique once every
 * list is merged into the one checklist each branch runs.
 */
export interface ChecklistList {
  key: string;
  label: string;
  idBase: number;
  /** Next unused local item id. Never decreases — ids are never recycled. */
  nextItemId: number;
  /** Counter behind generated section keys. Never decreases. */
  nextSectionKey: number;
  sections: Section[];
  archived?: boolean;
}

/** The whole editable checklist, as stored. */
export interface ChecklistDoc {
  lists: ChecklistList[];
  /** Next unused `idBase` for a new list. Never decreases. */
  nextIdBase: number;
}

/** A section of the merged checklist, tagged with the list it came from. */
export interface FullSection extends Section {
  listKey: string;
  listLabel: string;
}

export interface Branch {
  id: string;
  name: string;
  /** Where the branch is, shown under its name on the dashboard. */
  location: string;
  /**
   * Closed. Records name their branch as text, so a branch with history is
   * archived rather than deleted — its past inspections and jobs still read
   * correctly, but it is not offered for new work or chased for being due.
   */
  archived?: boolean;
}

export interface Answer {
  status: 'yes' | 'no';
  reason: string | null;
  otherReason: string | null;
  note: string | null;
  photo: string | null; // data URL or null
  /** Priority set by hand on this issue, overriding the computed one. */
  priorityOverride?: Severity | null;
  /**
   * The group the inspector filed this failure under, when it is not the one
   * the question was authored with.
   *
   * A question carries the group its failures usually belong to, but anything
   * can break: a cleaning check can fail because the surface is damaged, and
   * that is repair work whatever the question is about. So the inspector may
   * re-file a failure as it is recorded, which decides the reasons they are
   * offered, how the priority is worked out, and — for MAINTENANCE — whether
   * a job is raised on the maintenance board.
   *
   * Absent means the question's own group stands, which is every answer given
   * before this could be changed. Read it through `effectiveReasonGroup`
   * below, never directly.
   */
  reasonGroup?: ReasonGroup | null;
  /**
   * The kit this answer is actually about — the serial number, the unit, where
   * in the branch it is — as recorded by whoever marked it.
   *
   * A question can be authored with the kit it concerns, but only for kit that
   * is the same at every branch. "The freezer" is a different machine in each
   * one, and the person standing in front of it is the only one who can say
   * which. So this is recorded per inspection and never written back to the
   * question: it describes this branch's unit on this visit, not the check.
   *
   * It is what names the equipment on any maintenance job the finding raises,
   * which is the difference between sending a technician to "Storage
   * temperatures" and to "Freezer 2 — dry store".
   *
   * Absent means nothing was recorded and the question's own kit stands. An
   * empty array is not the same thing: it means the kit was cleared by hand.
   * Read it through `effectiveDetails` below.
   */
  details?: ItemDetail[] | null;
}

/**
 * The group in force for one answer: the inspector's own filing when they
 * changed it, else the group the question was authored with.
 *
 * Everything that reads a failure's group goes through here — the reasons
 * offered, the priority rules, the maintenance board, the dashboard's
 * breakdown and the report — so a re-filed failure reads the same way
 * everywhere it appears.
 */
export function effectiveReasonGroup(
  item: Pick<Item, 'reasonGroup'>,
  answer: Pick<Answer, 'reasonGroup'> | undefined
): ReasonGroup {
  return answer?.reasonGroup ?? item.reasonGroup;
}

/**
 * The kit one answer concerns: what the person marking recorded, else the kit
 * the question was authored with.
 *
 * Answered rather than merged, so what the marking screen shows in its fields
 * is exactly what the record keeps — a list half inherited from the question
 * and half typed in could not be edited predictably.
 */
export function effectiveDetails(
  item: Pick<Item, 'details'>,
  answer: Pick<Answer, 'details'> | undefined
): ItemDetail[] {
  return answer?.details ?? item.details ?? [];
}

/** The rows worth keeping, i.e. the ones somebody actually filled in. */
export function usableDetails(details: ItemDetail[]): ItemDetail[] {
  return details.filter((d) => d.value.trim());
}

/**
 * Where a visit is in its life.
 *
 *   assigned   a surprise visit the admin has raised and handed to an
 *              inspector, not yet started. Has no answers.
 *   draft      being filled in.
 *   submitted  signed off, and from that moment locked — see `lockedAt`.
 */
export type InspectionStatus = 'assigned' | 'draft' | 'submitted';

/**
 * How the visit came about, which is what decides who may carry it out and
 * who may change the result afterwards.
 *
 *   monday    the branch's own weekly inspection, filled in by its manager
 *   surprise  raised by the admin and assigned to an inspector, unannounced
 *
 * Distinct from `InspectionType` below, which says *why* a visit happened
 * (a complaint, a follow-up) and is only ever descriptive. This one carries
 * permissions, so it is deliberately a closed pair.
 */
export type InspectionKind = 'monday' | 'surprise';

export const INSPECTION_KIND_LABEL: Record<InspectionKind, string> = {
  monday: 'Regular Monday inspection',
  surprise: 'Surprise inspection',
};

/** The same, short enough for a table cell or a pill. */
export const INSPECTION_KIND_SHORT: Record<InspectionKind, string> = {
  monday: 'Monday',
  surprise: 'Surprise',
};

/**
 * Records made before visits were classified. They were all the branch's own
 * weekly round, so that is what an absent kind means.
 */
export function inspectionKindOf(inspection: Pick<Inspection, 'kind'>): InspectionKind {
  return inspection.kind ?? 'monday';
}

/** Why the visit happened. Shown on the report header. */
export type InspectionType = 'routine' | 'follow-up' | 'complaint' | 'pre-opening';

export const INSPECTION_TYPE_KEYS: InspectionType[] = [
  'routine',
  'follow-up',
  'complaint',
  'pre-opening',
];

export const INSPECTION_TYPE_LABEL: Record<InspectionType, string> = {
  routine: 'Routine inspection',
  'follow-up': 'Follow-up visit',
  complaint: 'Complaint investigation',
  'pre-opening': 'Pre-opening check',
};

/** How many days after a visit the next one falls due. The log runs weekly. */
export const INSPECTION_INTERVAL_DAYS = 7;

export interface Inspection {
  id: string;
  branchName: string;
  date: string; // ISO, e.g. "2026-08-24"
  time: string; // e.g. "12:30 pm"
  status: InspectionStatus;
  score: number; // percentage (0-100)
  signature: string | null; // data URL
  /**
   * Who signed the record off, and in what capacity. The branch manager is
   * not always on site, so the signature alone does not say who gave it —
   * these do. Absent on records made before they were captured.
   */
  signatoryName?: string;
  signatoryRole?: string;
  answers: Record<number, Answer>;
  currentSectionIndex?: number;
  /** Who carried out the visit. Absent on records made before this was captured. */
  inspectorName?: string;
  inspectionType?: InspectionType;
  /**
   * Monday round or surprise visit. Absent on records made before visits were
   * classified — read it through `inspectionKindOf`, never directly.
   */
  kind?: InspectionKind;
  /**
   * Surprise visits: the inspector it was handed to, and the admin who handed
   * it over. Held as user ids rather than names so renaming an account does
   * not orphan the assignment — `inspectorName` carries the name for display
   * and stays on the record for good.
   */
  assignedToUserId?: string;
  assignedByUserId?: string;
  /** ISO timestamp the assignment was raised. */
  assignedAt?: string;
  /** ISO timestamp the visit was started, which the duration is measured from. */
  startedAt?: string;
  /** ISO timestamp the report was signed and submitted. */
  submittedAt?: string;
  /** Who submitted it, for the audit line on the report. */
  submittedByUserId?: string;
  /**
   * When the answers were sealed. Set on submit, and the same moment as
   * `submittedAt` — a separate field because it is the *permission* that
   * matters here, not the timing: only the main admin may reopen a record
   * that carries this, and doing so records who did it below.
   */
  lockedAt?: string;
  /** Every admin override of a locked result, oldest first. */
  edits?: InspectionEdit[];
  /**
   * The items this inspection actually covered, in order, recorded on submit.
   * Lets a past report render exactly what was inspected — and score out of
   * it — even after the master checklist has been edited. Absent on drafts,
   * which follow the current checklist.
   */
  itemIds?: number[];
}

/**
 * An admin override of a submitted result.
 *
 * A locked record that can nevertheless be changed by one person needs to say
 * so on its face, otherwise "locked" is a claim the system cannot back up.
 * Every reopening appends one of these, and the report prints them.
 */
export interface InspectionEdit {
  /** ISO timestamp of the change. */
  at: string;
  byUserId: string;
  byName: string;
  /** The score before the edit, so a changed outcome is visible. */
  previousScore: number;
}

// ---------------------------------------------------------------------------
// Users and access
// ---------------------------------------------------------------------------

/**
 * Who is using the system.
 *
 *   admin           full control: every branch, every record, user accounts,
 *                   the checklist, and surprise visits - and the maintenance
 *                   board, so anything a job manager may do, they may do
 *   branch-manager  one branch: its records, and its own Monday inspection
 *   job-manager     the maintenance board across every branch: the repairs
 *                   inspections raise, and the ones reported directly. No
 *                   inspections, no accounts, no checklist
 *   inspector       the surprise visits handed to them, and nothing else
 *
 * These are degrees of reach, not of trust - a branch manager is not a lesser
 * admin, they simply cannot see past their own branch. Permissions are
 * spelled out one at a time in services/permissions.ts rather than inferred
 * from an ordering, because they do not nest cleanly: an inspector may submit
 * a visit at any branch, which a branch manager may not, and a job manager
 * works across every branch while seeing none of their inspections.
 */
export type UserRole = 'admin' | 'branch-manager' | 'job-manager' | 'inspector';

/**
 * The roles in the order they are listed. Screens read this rather than
 * keeping their own copy, so a fifth role would appear everywhere at once.
 */
export const USER_ROLE_KEYS: UserRole[] = [
  'admin',
  'branch-manager',
  'job-manager',
  'inspector',
];

export const USER_ROLE_LABEL: Record<UserRole, string> = {
  admin: 'Main Admin',
  'branch-manager': 'Branch Manager',
  'job-manager': 'Job Manager',
  inspector: 'Inspector',
};

/** One line on what each role is for, shown where accounts are managed. */
export const USER_ROLE_BLURB: Record<UserRole, string> = {
  admin: 'Full control of the system, every branch and all accounts',
  'branch-manager': 'Their own branch, and its regular Monday inspection',
  'job-manager': 'The maintenance board at every branch, repairs rather than inspections',
  inspector: 'Surprise visits assigned to them, at any branch',
};

export interface User {
  id: string;
  name: string;
  /** Also the sign-in name. Unique, case-insensitively. */
  email: string;
  /**
   * Stored as typed. This is a demo system with no server to hash against —
   * when accounts move to a backend, nothing outside userStore reads this.
   */
  password: string;
  role: UserRole;
  /**
   * The branch this account belongs to. Required for a branch manager, which
   * is the whole of their access; meaningless for the other two, who are not
   * tied to one branch.
   */
  branchName?: string;
  /** Shown in the avatar when there is no photo. */
  initials: string;
  /**
   * Withdrawn accounts are kept rather than deleted: their name still appears
   * on the inspections they submitted, and a deleted id would leave those
   * records pointing at nothing.
   */
  active: boolean;
  /** ISO date the account was created. */
  createdAt: string;
}

/** Initials for the avatar, from however many words the name has. */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------

/**
 * What kind of kit or fabric a maintenance job concerns. Deliberately its own
 * taxonomy rather than the checklist's reason groups: those describe why a
 * check failed, these describe what needs a technician.
 */
export type MaintenanceCategory =
  | 'REFRIGERATION'
  | 'AC_VENTILATION'
  | 'ELECTRICAL'
  | 'PLUMBING'
  | 'GAS'
  | 'COOKING_EQUIPMENT'
  | 'FIRE_SAFETY'
  | 'STRUCTURAL'
  | 'PEST_CONTROL'
  | 'OTHER';

export const MAINTENANCE_CATEGORY_KEYS: MaintenanceCategory[] = [
  'REFRIGERATION',
  'AC_VENTILATION',
  'ELECTRICAL',
  'PLUMBING',
  'GAS',
  'COOKING_EQUIPMENT',
  'FIRE_SAFETY',
  'STRUCTURAL',
  'PEST_CONTROL',
  'OTHER',
];

export const MAINTENANCE_CATEGORY_LABEL: Record<MaintenanceCategory, string> = {
  REFRIGERATION: 'Refrigeration',
  AC_VENTILATION: 'AC & ventilation',
  ELECTRICAL: 'Electrical',
  PLUMBING: 'Plumbing & drainage',
  GAS: 'Gas',
  COOKING_EQUIPMENT: 'Cooking equipment',
  FIRE_SAFETY: 'Fire safety',
  STRUCTURAL: 'Building & fabric',
  PEST_CONTROL: 'Pest control',
  OTHER: 'Other',
};

/**
 * Where a job has got to. Never stored — it is read off the timestamps by
 * `statusOf`, so the two can never contradict each other.
 */
export type MaintenanceStatus = 'reported' | 'in-progress' | 'completed';

export const MAINTENANCE_STATUS_LABEL: Record<MaintenanceStatus, string> = {
  reported: 'Reported',
  'in-progress': 'In progress',
  completed: 'Completed',
};

/** One problem raised at a branch, and the work done about it. */
export interface MaintenanceJob {
  id: string;
  branchName: string;
  /** One line naming the problem, e.g. "Dining area AC not cooling". */
  title: string;
  /** What is wrong, in the reporter's own words. */
  details: string;
  /** The unit or place concerned, e.g. "Split AC 2 — dining area". */
  equipment: string;
  category: MaintenanceCategory;
  /** How urgent, on the same scale the checklist uses. */
  priority: Severity;

  reportedBy: string;
  /** ISO timestamp the problem was logged. */
  reportedAt: string;

  /** ISO timestamp work began. Null until someone starts it. */
  startedAt: string | null;
  /** ISO timestamp work finished. Null until someone ends it. */
  completedAt: string | null;

  /** Who carried out the work — engineer, contractor or staff member. */
  attendedBy: string | null;
  /** What was actually done, recorded when the job is ended. */
  resolutionNote: string | null;
  /** What it cost, when that is known. Left out of totals when null. */
  cost: number | null;
  /** Photo of the fault or the repair. */
  photo: string | null;

  /** The inspection finding that raised this, when it came from one. */
  sourceInspectionId?: string;
  sourceItemId?: number;
}

export const REASON_GROUPS: Record<ReasonGroup, string[]> = {
  STAFF: [
    'Staff not provided with the item',
    'Waiting for new uniform or stock',
    'New staff not yet briefed',
    'Item worn out or damaged',
    'Staff did not follow instruction',
    'Other',
  ],
  CLEANING: [
    'Not cleaned during the shift',
    'Cleaning staff absent today',
    'Heavy rush, cleaning delayed',
    'Needs deep cleaning beyond daily clean',
    'Surface damaged, cannot be cleaned properly',
    'Other',
  ],
  EQUIPMENT: [
    'Equipment not working, out of order',
    'Awaiting repair or technician visit',
    'Power or gas supply issue',
    'Consumable finished (bulb, refill, gas)',
    'Equipment not installed at this location',
    'Other',
  ],
  SUPPLY: [
    'Stock finished, not reordered',
    'Reorder placed, awaiting delivery',
    'Item misplaced, not at its location',
    'Not refilled by staff',
    'Other',
  ],
  FOOD: [
    'Stored incorrectly by staff',
    'No space in designated storage',
    'Not covered or sealed properly',
    'Label or date missing',
    'Expired item not removed',
    'Other',
  ],
  PEST: [
    'Pest control visit overdue',
    'Entry point or gap found in the area',
    'Waste not cleared, attracting pests',
    'Treated recently, still monitoring',
    'Other',
  ],
  RECORDS: [
    'Sheet or register not filled by staff',
    'Sheet or register missing from its location',
    'Staff not trained to maintain it',
    'Filled late, entries have gaps',
    'Other',
  ],
  SAFETY: [
    'Inspection or service expired',
    'Unit missing from its location',
    'Access to the unit is blocked',
    'Awaiting service vendor',
    'Other',
  ],
  TEMPERATURE: [
    'Unit not holding temperature, needs service',
    'Door left open or seal damaged',
    'Unit overloaded, air flow blocked',
    'Thermostat set incorrectly',
    'Food not left long enough to reach temperature',
    'Probe not available or not calibrated',
    'Reading not taken at the required time',
    'Other',
    ],
  MAINTENANCE: [
    'Broken, needs repair',
    'Not working, needs a technician',
    'Worn out, needs replacing',
    'Leaking or damaged',
    'Service or inspection overdue',
    'Reported already, awaiting parts',
    'Other',
  ],
};

/**
 * The inspectors who carry out visits, offered as a list on the New
 * Inspection screen. "Other" there still allows a name that is not on it, so
 * a stand-in or a new starter is never blocked from recording a visit.
 */
export const INSPECTORS: string[] = [
  'A. Rahman',
  'S. Iqbal',
  'M. Farooq',
  'H. Siddiqui',
  'N. Abbas',
  'R. Chowdhury',
];

export const BRANCHES: Branch[] = [
  { id: 'zahras-kitchen', name: "Zahra's Kitchen", location: 'Kharian, Gujrat' },
  { id: 'gujrat-restaurant', name: 'Gujrat Restaurant', location: 'Gujrat City' },
  { id: 'mafraq-gujrat', name: 'Mafraq Gujrat Restaurant', location: 'Mafraq, Gujrat' },
  { id: 'naan-house-metro', name: 'Naan House Metro', location: 'Metro, Gujrat' },
];
