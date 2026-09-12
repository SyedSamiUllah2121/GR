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
    note: 'Sockets, switches and visible wiring checked for heat and damage.',
  },
  PLUMBING: {
    interval: { every: 6, unit: 'months' },
    priority: 'medium',
    note: 'Traps cleared, taps and seals checked for leaks.',
  },
  GAS: {
    interval: { every: 6, unit: 'months' },
    priority: 'critical',
    note: 'Connections leak-tested, hoses checked for perishing.',
  },
  COOKING_EQUIPMENT: {
    interval: { every: 2, unit: 'months' },
    priority: 'medium',
    note: 'Burners and thermostats checked, seals and cut-outs tested.',
  },
  FIRE_SAFETY: {
    interval: { every: 30, unit: 'days' },
    priority: 'critical',
    note: 'Pressure gauge in the green, pin and seal intact, access clear.',
  },
  STRUCTURAL: {
    interval: { every: 12, unit: 'months' },
    priority: 'low',
    note: 'Tiles, grout, doors and shelving checked for damage.',
  },
  PEST_CONTROL: {
    interval: { every: 3, unit: 'months' },
    priority: 'high',
    note: 'Stations checked and the report filed.',
  },
  IT_EQUIPMENT: {
    interval: { every: 3, unit: 'months' },
    priority: 'medium',
    note: 'Cleaned, cabling checked, firmware current, test print.',
  },
  WATER_HEATING: {
    interval: { every: 6, unit: 'months' },
    priority: 'high',
    note: 'Element and thermostat checked, tank flushed, relief valve tested.',
  },
  SECURITY: {
    interval: { every: 3, unit: 'months' },
    priority: 'medium',
    note: 'Lenses cleaned, angles checked, recording confirmed and retention verified.',
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
    id: 'plan-it_equipment-service',
    category: 'IT_EQUIPMENT',
    task: 'Printer service',
    every: 6,
    unit: 'months',
    everyMonths: 6,
    priority: 'medium',
    instructions: 'Full service: rollers, head clean, firmware, test print.',
    active: true,
    createdAt: '2026-01-01',
  },
  {
    id: 'plan-it_equipment-toner-refill',
    category: 'IT_EQUIPMENT',
    task: 'Toner refill',
    every: 6,
    unit: 'months',
    everyMonths: 6,
    priority: 'low',
    instructions: 'Replace or refill toner and log the cartridge number.',
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
    id: 'plan-ac_ventilation-service',
    category: 'AC_VENTILATION',
    task: 'Service',
    every: 12,
    unit: 'months',
    everyMonths: 12,
    priority: 'medium',
    instructions: 'Filters, gas, drainage. Extraction hoods degreased.',
    active: true,
    createdAt: '2026-01-01',
  },
  {
    id: 'plan-fire_safety-inspection',
    category: 'FIRE_SAFETY',
    task: 'Extinguisher inspection',
    every: 12,
    unit: 'months',
    everyMonths: 12,
    priority: 'critical',
    instructions: 'Certified inspection. Record the certificate with the job.',
    active: true,
    createdAt: '2026-01-01',
  },
  {
    id: 'plan-pest_control-visit',
    category: 'PEST_CONTROL',
    task: 'Contract visit',
    every: 3,
    unit: 'months',
    everyMonths: 3,
    priority: 'high',
    instructions: 'Bait stations checked and the report filed.',
    active: true,
    createdAt: '2026-01-01',
  },
  {
    id: 'plan-cooking_equipment-service',
    category: 'COOKING_EQUIPMENT',
    task: 'Service',
    every: 12,
    unit: 'months',
    everyMonths: 12,
    priority: 'medium',
    instructions: 'Burners, thermostats, seals and safety cut-outs.',
    active: true,
    createdAt: '2026-01-01',
  },
  {
    id: 'plan-gas-safety-check',
    category: 'GAS',
    task: 'Safety check',
    every: 12,
    unit: 'months',
    everyMonths: 12,
    priority: 'critical',
    instructions: 'Certified gas safety check. Certificate required.',
    active: true,
    createdAt: '2026-01-01',
  },
  {
    id: 'plan-water_heating-descale',
    category: 'WATER_HEATING',
    task: 'Descale',
    every: 12,
    unit: 'months',
    everyMonths: 12,
    priority: 'medium',
    instructions: 'Tank drained and descaled, anode checked.',
    active: true,
    createdAt: '2026-01-01',
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
