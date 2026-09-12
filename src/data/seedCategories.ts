import { EquipmentCategory } from '../types';

/**
 * The trades a fresh installation starts with.
 *
 * The ids are the eleven keys this app used when the category was a hardcoded
 * list, verbatim and in SCREAMING_CASE. That is not tidiness, it is the whole
 * migration: every job, asset and plan already sitting in somebody's browser
 * names its category by one of these strings, so seeding the store under the
 * same ids means those records resolve on the first load and not one of them
 * has to be rewritten. The words can be changed; the ids never are.
 *
 * A category the operator adds later gets a slug id instead, so the store ends
 * up holding two id conventions for good. That is the price of not rewriting
 * stored data, and it is the right price — the id is machinery, and the only
 * place it is ever shown is the line in the category editor explaining why
 * renaming does not change it.
 */
export const SEED_CATEGORIES: EquipmentCategory[] = [
  { id: 'REFRIGERATION', label: 'Refrigeration', active: true, createdAt: '2026-01-01' },
  { id: 'AC_VENTILATION', label: 'AC & ventilation', active: true, createdAt: '2026-01-01' },
  { id: 'ELECTRICAL', label: 'Electrical', active: true, createdAt: '2026-01-01' },
  { id: 'PLUMBING', label: 'Plumbing & drainage', active: true, createdAt: '2026-01-01' },
  { id: 'GAS', label: 'Gas', active: true, createdAt: '2026-01-01' },
  { id: 'COOKING_EQUIPMENT', label: 'Cooking equipment', active: true, createdAt: '2026-01-01' },
  { id: 'FIRE_SAFETY', label: 'Fire safety', active: true, createdAt: '2026-01-01' },
  { id: 'STRUCTURAL', label: 'Building & fabric', active: true, createdAt: '2026-01-01' },
  { id: 'PEST_CONTROL', label: 'Pest control', active: true, createdAt: '2026-01-01' },
  { id: 'IT_EQUIPMENT', label: 'IT & printers', active: true, createdAt: '2026-01-01' },
  { id: 'WATER_HEATING', label: 'Water heating', active: true, createdAt: '2026-01-01' },
  { id: 'SECURITY', label: 'Security & CCTV', active: true, createdAt: '2026-01-01' },
  /*
   * Last deliberately. It is where the intake files anything it cannot place,
   * and a list that ends in "Other" reads as complete in a way one that
   * buries it does not.
   */
  { id: 'OTHER', label: 'Other', active: true, createdAt: '2026-01-01' },
];
