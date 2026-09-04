import { Answer, Inspection, TemplateKey } from '../types';
import { TEMPLATES } from './templates';

// A simple clean SVG signature data URL for seeded manager sign-offs
const SAMPLE_SIGNATURE =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="90" viewBox="0 0 280 90">
      <path d="M 20 55 Q 45 15, 60 48 T 90 40 T 120 52 Q 140 20, 160 55 T 195 45 Q 220 58, 260 40 M 45 68 Q 120 72, 240 60" 
        fill="none" stroke="#213B26" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
    </svg>`
  );

function createAnswersForInspection(
  templateKey: TemplateKey,
  noItems: Record<number, { reason: string; otherReason?: string; note?: string }>
): Record<number, Answer> {
  const template = TEMPLATES[templateKey];
  const answers: Record<number, Answer> = {};

  template.sections.forEach((sec) => {
    sec.items.forEach((item) => {
      if (noItems[item.id]) {
        const itemInfo = noItems[item.id];
        answers[item.id] = {
          status: 'no',
          reason: itemInfo.reason,
          otherReason: itemInfo.otherReason || null,
          note: itemInfo.note || null,
          photo: null,
        };
      } else {
        answers[item.id] = {
          status: 'yes',
          reason: null,
          otherReason: null,
          note: null,
          photo: null,
        };
      }
    });
  });

  return answers;
}

function calculateScore(answers: Record<number, Answer>, totalItems: number): number {
  const yesCount = Object.values(answers).filter((a) => a.status === 'yes').length;
  return Math.round((yesCount / totalItems) * 100);
}

const seed1Answers = createAnswersForInspection('kitchen', {
  1: { reason: 'Waiting for new uniform or stock' },
});

const seed2Answers = createAnswersForInspection('frontofhouse', {
  6: { reason: 'Equipment not working, out of order' },
  7: { reason: 'Stock finished, not reordered' },
  15: { reason: 'Sheet or register missing from its location' },
});

const seed3Answers = createAnswersForInspection('kitchen', {
  7: { reason: 'Stored incorrectly by staff' },
  10: {
    reason: 'Other',
    otherReason:
      "Outside wall tiles of Zahra's Kitchen and the pizza kitchen are fully damaged and need to be urgently changed",
  },
  11: { reason: 'Not cleaned during the shift' },
});

const seed4Answers = createAnswersForInspection('kitchen', {
  4: { reason: 'Staff did not follow instruction' },
  12: { reason: 'Equipment not working, out of order' },
  19: { reason: 'Not covered or sealed properly' },
  22: { reason: 'Sheet or register not filled by staff' },
  27: { reason: 'Label or date missing' },
});

export const SEED_INSPECTIONS: Inspection[] = [
  {
    id: 'insp-seed-1',
    branchName: 'Naan House Metro',
    templateKey: 'kitchen',
    date: '2026-08-24',
    time: '12:30 pm',
    status: 'submitted',
    score: calculateScore(seed1Answers, 27),
    signature: SAMPLE_SIGNATURE,
    answers: seed1Answers,
  },
  {
    id: 'insp-seed-2',
    branchName: 'Gujrat Restaurant',
    templateKey: 'frontofhouse',
    date: '2026-08-24',
    time: '4:10 pm',
    status: 'submitted',
    score: calculateScore(seed2Answers, 27),
    signature: SAMPLE_SIGNATURE,
    answers: seed2Answers,
  },
  {
    id: 'insp-seed-3',
    branchName: "Zahra's Kitchen",
    templateKey: 'kitchen',
    date: '2026-08-24',
    time: '4:10 pm',
    status: 'submitted',
    score: calculateScore(seed3Answers, 27),
    signature: SAMPLE_SIGNATURE,
    answers: seed3Answers,
  },
  {
    id: 'insp-seed-4',
    branchName: 'Mafraq Gujrat Restaurant',
    templateKey: 'kitchen',
    date: '2026-08-17',
    time: '2:00 pm',
    status: 'submitted',
    score: calculateScore(seed4Answers, 27),
    signature: SAMPLE_SIGNATURE,
    answers: seed4Answers,
  },
];
