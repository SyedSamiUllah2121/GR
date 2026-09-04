export type ReasonGroup =
  | 'STAFF'
  | 'CLEANING'
  | 'EQUIPMENT'
  | 'SUPPLY'
  | 'FOOD'
  | 'PEST'
  | 'RECORDS'
  | 'SAFETY';

export interface Item {
  id: number;
  text: string;
  reasonGroup: ReasonGroup;
}

export interface Section {
  title: string;
  items: Item[];
}

export type TemplateKey = 'kitchen' | 'frontofhouse';

export interface Template {
  key: TemplateKey;
  label: string;
  sections: Section[];
}

export interface Branch {
  id: string;
  name: string;
}

export interface Answer {
  status: 'yes' | 'no';
  reason: string | null;
  otherReason: string | null;
  note: string | null;
  photo: string | null; // data URL or null
}

export type InspectionStatus = 'draft' | 'submitted';

export interface Inspection {
  id: string;
  branchName: string;
  templateKey: TemplateKey;
  date: string; // ISO, e.g. "2026-08-24"
  time: string; // e.g. "12:30 pm"
  status: InspectionStatus;
  score: number; // percentage (0-100)
  signature: string | null; // data URL
  answers: Record<number, Answer>;
  currentSectionIndex?: number;
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
};

export const BRANCHES: Branch[] = [
  { id: 'zahras-kitchen', name: "Zahra's Kitchen" },
  { id: 'gujrat-restaurant', name: 'Gujrat Restaurant' },
  { id: 'mafraq-gujrat', name: 'Mafraq Gujrat Restaurant' },
  { id: 'naan-house-metro', name: 'Naan House Metro' },
];
