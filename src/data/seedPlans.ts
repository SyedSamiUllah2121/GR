import { Interval, MaintenancePlan, Severity } from '../types';
import { SEED_CATEGORIES } from './seedCategories';

/**
 * The recurring services a fresh installation starts with.
 *
 * Two kinds, and the difference is worth knowing. Every category has exactly
 * one GENERAL MAINTENANCE plan, which is the cadence every asset filed under
 * it keeps unless its own record says otherwise — "the fridges get looked at
 * every six months". Beside those sit the NAMED tasks, the work that recurs on
 * its own clock and has to be called something: a printer's toner, a gas
 * certificate, the pest contract.
 *
 * The general plans are generated here from the category list rather than
 * written out one by one, because they are not a judgement — there is one per
 * category by construction, and a hand-written list would drift out of step
 * with the categories the first time one was added.
 *
 * Seeds, not rules. The admin edits every one of them, the general ones from
 * the Categories dialog on the register or the Schedule tab on the board, and
 * an operator whose contract says otherwise should.
 */

/** Written exactly as `generalPlanIdFor` derives it, which is where it is read. */
function generalPlan(
  category: string,
  interval: Interval,
  priority: Severity,
  instructions: string
): MaintenancePlan {
  return {
    id: `plan-${category.toLowerCase()}-general-maintenance`,
    category,
    task: 'General maintenance',
    every: interval.every,
    unit: interval.unit,
    // Kept truthful for anything reading the old field; days round to months
    everyMonths:
      interval.unit === 'months' ? interval.every : Math.max(1, Math.round(interval.every / 30)),
    priority,
    instructions,
    active: true,
    createdAt: '2026-01-01',
  };
}

/** What each trade is generally looked at on, and how urgent that is. */
/**
 * What each trade is generally looked at on, and how urgent that is.
 *
 * The three the estate has, and the fallback. A category the operator adds
 * later is not listed here and does not need to be — the export below gives
 * anything unlisted a six-monthly general plan, which is a defensible default
 * and editable the moment they look at it.
 *
 * The air-conditioning cadence is the one worth defending: 45 days, not six
 * months, because these are kitchen and hall units in Abu Dhabi and the
 * register that shipped with this app already shows 35 of 91 overdue. A
 * six-monthly rule would have agreed with that backlog instead of raising it.
 */
const GENERAL: Record<string, { interval: Interval; priority: Severity; note: string }> = {
  REFRIGERATION: {
    interval: { every: 3, unit: 'months' },
    priority: 'high',
    note: 'Coils cleaned, door seals checked, temperature log reviewed.',
  },
  AC_VENTILATION: {
    interval: { every: 45, unit: 'days' },
    priority: 'medium',
    note: 'Filters washed, drainage cleared, cooling checked at the vent.',
  },
  ELECTRICAL: {
    interval: { every: 6, unit: 'months' },
    priority: 'medium',
    note: 'Plug, lead and switch checked for heat and damage; casing and guards sound.',
  },
  OTHER: {
    interval: { every: 12, unit: 'months' },
    priority: 'low',
    note: 'Looked over for anything wearing or working loose.',
  },
};

/** The work that recurs on its own clock and has to be called something. */
const NAMED: MaintenancePlan[] = [
  {
    id: 'plan-ac_ventilation-service',
    category: 'AC_VENTILATION',
    task: 'Full service',
    every: 12,
    unit: 'months',
    everyMonths: 12,
    priority: 'medium',
    instructions: 'Gas pressure, coil wash, drainage flushed, electricals checked.',
    active: true,
    createdAt: '2026-01-01',
  },
  {
    id: 'plan-refrigeration-service',
    category: 'REFRIGERATION',
    task: 'Service',
    every: 12,
    unit: 'months',
    everyMonths: 12,
    priority: 'high',
    instructions: 'Gas pressure, door seals, coil clean, temperature log check.',
    active: true,
    createdAt: '2026-01-01',
  },
  {
    id: 'plan-electrical-safety-check',
    category: 'ELECTRICAL',
    task: 'Safety check',
    every: 12,
    unit: 'months',
    everyMonths: 12,
    priority: 'critical',
    instructions:
      'Earth continuity, insulation and RCD tested. Certificate recorded with the job.',
    active: true,
    createdAt: '2026-09-17',
  },
];

export const SEED_PLANS: MaintenancePlan[] = [
  ...SEED_CATEGORIES.map((c) => {
    const rule = GENERAL[c.id] ?? {
      interval: { every: 6, unit: 'months' as const },
      priority: 'medium' as Severity,
      note: 'General maintenance: clean, check, test, and note anything wearing.',
    };
    return generalPlan(c.id, rule.interval, rule.priority, rule.note);
  }),
  ...NAMED,
];
