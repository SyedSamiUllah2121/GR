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
}

export type InspectionStatus = 'draft' | 'submitted';

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
  answers: Record<number, Answer>;
  currentSectionIndex?: number;
  /** Who carried out the visit. Absent on records made before this was captured. */
  inspectorName?: string;
  inspectionType?: InspectionType;
  /** ISO timestamp the visit was started, which the duration is measured from. */
  startedAt?: string;
  /** ISO timestamp the report was signed and submitted. */
  submittedAt?: string;
  /**
   * The items this inspection actually covered, in order, recorded on submit.
   * Lets a past report render exactly what was inspected — and score out of
   * it — even after the master checklist has been edited. Absent on drafts,
   * which follow the current checklist.
   */
  itemIds?: number[];
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
