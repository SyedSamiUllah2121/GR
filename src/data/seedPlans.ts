import { MaintenancePlan } from '../types';

/**
 * The recurring services a fresh installation starts with.
 *
 * These are the intervals named when the feature was specified — a printer
 * serviced quarterly, its toner every six months — plus the handful of
 * checks that every kitchen runs on a clock whether or not anyone writes
 * them down: the extraction hood, the fire extinguishers, the pest contract.
 *
 * Seeds, not rules. The admin edits every one of them from the Schedule
 * screen, and an operator whose contract says otherwise should.
 */
export const SEED_PLANS: MaintenancePlan[] = [
  {
    id: 'plan-it_equipment-service',
    category: 'IT_EQUIPMENT',
    task: 'Printer service',
    everyMonths: 3,
    priority: 'medium',
    instructions: 'Full service: rollers, head clean, firmware, test print.',
    active: true,
    createdAt: '2026-01-01',
  },
  {
    id: 'plan-it_equipment-toner-refill',
    category: 'IT_EQUIPMENT',
    task: 'Toner refill',
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
    everyMonths: 6,
    priority: 'high',
    instructions: 'Gas pressure, door seals, coil clean, temperature log check.',
    active: true,
    createdAt: '2026-01-01',
  },
  {
    id: 'plan-ac_ventilation-service',
    category: 'AC_VENTILATION',
    task: 'Service',
    everyMonths: 6,
    priority: 'medium',
    instructions: 'Filters, gas, drainage. Extraction hoods degreased.',
    active: true,
    createdAt: '2026-01-01',
  },
  {
    id: 'plan-fire_safety-inspection',
    category: 'FIRE_SAFETY',
    task: 'Extinguisher inspection',
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
    everyMonths: 12,
    priority: 'critical',
    instructions: 'Certified gas safety check. Certificate required.',
    active: true,
    createdAt: '2026-01-01',
  },
];
