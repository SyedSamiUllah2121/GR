import { Answer, Inspection, InspectionType } from '../types';
import { DEFAULT_CHECKLIST } from './defaultChecklist';
import { buildSections, flattenItems, globalId } from '../services/checklistStore';

// Seeded records are historical, so they are built against the shipped
// default checklist rather than whatever the checklist has since been edited to.
const SEED_ITEMS = flattenItems(buildSections(DEFAULT_CHECKLIST));
const SEED_ITEM_IDS = SEED_ITEMS.map((i) => i.id);
const SEED_TOTAL = SEED_ITEMS.length;

function itemId(listKey: string, localId: number): number {
  const list = DEFAULT_CHECKLIST.lists.find((l) => l.key === listKey);
  if (!list) throw new Error('Unknown checklist list: ' + listKey);
  return globalId(list, localId);
}

// A simple clean SVG signature data URL for seeded manager sign-offs
const SAMPLE_SIGNATURE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="90" viewBox="0 0 280 90">
      <path d="M 20 55 Q 45 15, 60 48 T 90 40 T 120 52 Q 140 20, 160 55 T 195 45 Q 220 58, 260 40 M 45 68 Q 120 72, 240 60"
        fill="none" stroke="#17181D" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>`
  );

// Stand-in evidence photo, so seeded critical issues satisfy the rule that
// critical findings must be photographed before an inspection is submitted.
const SAMPLE_EVIDENCE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="200" viewBox="0 0 300 200">
      <rect width="300" height="200" fill="#FDECEE"/>
      <rect x="12" y="12" width="276" height="176" rx="6" fill="#FFFFFF" stroke="#C8202D" stroke-width="2" stroke-dasharray="4,4"/>
      <circle cx="150" cy="78" r="22" fill="#FDECEE" stroke="#C8202D" stroke-width="2"/>
      <path d="M150 68v14M150 88v2" stroke="#C8202D" stroke-width="3" stroke-linecap="round"/>
      <text x="150" y="130" fill="#C8202D" font-family="sans-serif" font-size="13" font-weight="bold" text-anchor="middle">Photo Evidence Attached</text>
      <text x="150" y="152" fill="#6B6F76" font-family="sans-serif" font-size="11" text-anchor="middle">Critical finding capture</text>
    </svg>`
  );

type SeedFlag = { reason: string; otherReason?: string; note?: string; photo?: string };

/**
 * Every seeded inspection covers the full checklist: each item is 'yes' unless
 * it is listed in `flagged`, keyed by global item id via itemId(list, localId).
 */
function createAnswers(flagged: Record<number, SeedFlag>): Record<number, Answer> {
  const answers: Record<number, Answer> = {};

  SEED_ITEMS.forEach((item) => {
    const flag = flagged[item.id];
    answers[item.id] = flag
      ? {
          status: 'no',
          reason: flag.reason,
          otherReason: flag.otherReason || null,
          note: flag.note || null,
          photo: flag.photo || null,
        }
      : {
          status: 'yes',
          reason: null,
          otherReason: null,
          note: null,
          photo: null,
        };
  });

  return answers;
}

function calculateScore(answers: Record<number, Answer>): number {
  const yesCount = Object.values(answers).filter((a) => a.status === 'yes').length;
  return Math.round((yesCount / SEED_TOTAL) * 100);
}

const seed1Answers = createAnswers({
  [itemId('kitchen', 1)]: { reason: 'Waiting for new uniform or stock' },
  [itemId('frontofhouse', 4)]: { reason: 'Item misplaced, not at its location' },
});

const seed2Answers = createAnswers({
  [itemId('kitchen', 8)]: { reason: 'Heavy rush, cleaning delayed' },
  [itemId('frontofhouse', 6)]: { reason: 'Equipment not working, out of order' },
  [itemId('frontofhouse', 7)]: { reason: 'Stock finished, not reordered' },
  [itemId('frontofhouse', 15)]: { reason: 'Sheet or register missing from its location' },
});

// Zahra's Kitchen, the earlier of its two visits. Items 10 and 11 recur on the
// later visit below, which is what makes them escalate as repeat issues.
const seed5Answers = createAnswers({
  [itemId('kitchen', 10)]: { reason: 'Needs deep cleaning beyond daily clean' },
  [itemId('kitchen', 11)]: { reason: 'Not cleaned during the shift' },
  [itemId('frontofhouse', 8)]: { reason: 'Heavy rush, cleaning delayed' },
});

const seed3Answers = createAnswers({
  [itemId('kitchen', 7)]: {
    reason: 'Stored incorrectly by staff',
    photo: SAMPLE_EVIDENCE,
  },
  [itemId('kitchen', 10)]: {
    reason: 'Other',
    otherReason:
      "Outside wall tiles of Zahra's Kitchen and the pizza kitchen are fully damaged and need to be urgently changed",
  },
  [itemId('kitchen', 11)]: { reason: 'Not cleaned during the shift' },
  [itemId('frontofhouse', 20)]: { reason: 'Not cleaned during the shift' },
});

const seed4Answers = createAnswers({
  [itemId('kitchen', 4)]: { reason: 'Staff did not follow instruction' },
  // High base risk, but "out of order" escalates this one to critical
  [itemId('branchwide', 4)]: {
    reason: 'Equipment not working, out of order',
    photo: SAMPLE_EVIDENCE,
  },
  [itemId('kitchen', 19)]: { reason: 'Not covered or sealed properly' },
  [itemId('kitchen', 22)]: { reason: 'Sheet or register not filled by staff' },
  [itemId('branchwide', 2)]: { reason: 'Label or date missing' },
  [itemId('frontofhouse', 10)]: {
    reason: 'Pest control visit overdue',
    photo: SAMPLE_EVIDENCE,
  },
  [itemId('frontofhouse', 14)]: { reason: 'Awaiting repair or technician visit' },
});

/**
 * Start and submit timestamps for a seeded visit, from its date, the hour it
 * began and how long it ran. Written out so the demo records carry the same
 * metadata a real visit records, which is what the report header reads.
 */
function visitTimes(
  date: string,
  startHour: number,
  startMinute: number,
  minutes: number
): { startedAt: string; submittedAt: string } {
  const start = new Date(`${date}T00:00:00`);
  start.setHours(startHour, startMinute, 0, 0);
  const end = new Date(start.getTime() + minutes * 60000);
  return { startedAt: start.toISOString(), submittedAt: end.toISOString() };
}

const ROUTINE: InspectionType = 'routine';

export const SEED_INSPECTIONS: Inspection[] = [
  {
    id: 'insp-seed-1',
    inspectorName: 'A. Rahman',
    inspectionType: ROUTINE,
    ...visitTimes('2026-08-24', 12, 30, 74),
    branchName: 'Naan House Metro',
    date: '2026-08-24',
    time: '12:30 pm',
    status: 'submitted',
    score: calculateScore(seed1Answers),
    signature: SAMPLE_SIGNATURE,
    answers: seed1Answers,
    itemIds: SEED_ITEM_IDS,
  },
  {
    id: 'insp-seed-2',
    inspectorName: 'S. Iqbal',
    inspectionType: ROUTINE,
    ...visitTimes('2026-08-24', 16, 10, 88),
    branchName: 'Gujrat Restaurant',
    date: '2026-08-24',
    time: '4:10 pm',
    status: 'submitted',
    score: calculateScore(seed2Answers),
    signature: SAMPLE_SIGNATURE,
    answers: seed2Answers,
    itemIds: SEED_ITEM_IDS,
  },
  {
    id: 'insp-seed-3',
    inspectorName: 'A. Rahman',
    inspectionType: 'follow-up',
    ...visitTimes('2026-08-24', 16, 10, 95),
    branchName: "Zahra's Kitchen",
    date: '2026-08-24',
    time: '4:10 pm',
    status: 'submitted',
    score: calculateScore(seed3Answers),
    signature: SAMPLE_SIGNATURE,
    answers: seed3Answers,
    itemIds: SEED_ITEM_IDS,
  },
  {
    id: 'insp-seed-4',
    inspectorName: 'M. Farooq',
    inspectionType: ROUTINE,
    ...visitTimes('2026-08-17', 14, 0, 112),
    branchName: 'Mafraq Gujrat Restaurant',
    date: '2026-08-17',
    time: '2:00 pm',
    status: 'submitted',
    score: calculateScore(seed4Answers),
    signature: SAMPLE_SIGNATURE,
    answers: seed4Answers,
    itemIds: SEED_ITEM_IDS,
  },
  {
    id: 'insp-seed-5',
    inspectorName: 'S. Iqbal',
    inspectionType: ROUTINE,
    ...visitTimes('2026-08-17', 11, 15, 68),
    branchName: "Zahra's Kitchen",
    date: '2026-08-17',
    time: '11:15 am',
    status: 'submitted',
    score: calculateScore(seed5Answers),
    signature: SAMPLE_SIGNATURE,
    answers: seed5Answers,
    itemIds: SEED_ITEM_IDS,
  },
];
