import { EquipmentCategory } from '../types';

/**
 * The trades this estate services under.
 *
 * Three, because that is what the estate's own paperwork has: an AC register,
 * a chiller record and an electrical register. Every one of the 302 assets
 * falls into one of them, and a category with nothing in it is a line on the
 * register screen that never resolves into anything — so the eleven trades
 * the app used to ship with, invented before there was any data, are gone.
 *
 * The three ids are the app's originals, verbatim and in SCREAMING_CASE, and
 * that is not tidiness — it is the whole migration. Every job, asset and plan
 * already sitting in somebody's browser names its category by one of these
 * strings, and every plan id is built from one, so keeping the ids means those
 * records resolve on the first load and not one of them has to be rewritten.
 * The words can be changed; the ids never are.
 *
 * A category the operator adds later gets a slug id instead, so the store ends
 * up holding two id conventions for good. That is the price of not rewriting
 * stored data, and it is the right price — the id is machinery, and the only
 * place it is ever shown is the line in the category editor explaining why
 * renaming does not change it.
 *
 * Adding gas, fire safety or plumbing is a button on the category screen, and
 * `assetSegmentFor` will number their assets when somebody does.
 */
export const SEED_CATEGORIES: EquipmentCategory[] = [
  {
    id: 'AC_VENTILATION',
    label: 'AC & ventilation',
    active: true,
    createdAt: '2026-09-17',
  },
  {
    id: 'REFRIGERATION',
    label: 'Refrigeration & chillers',
    active: true,
    createdAt: '2026-09-17',
  },
  {
    id: 'ELECTRICAL',
    label: 'Electrical equipment',
    active: true,
    createdAt: '2026-09-17',
  },
  /*
   * Last deliberately. It is where the intake files anything it cannot place,
   * and a list that ends in "Other" reads as complete in a way one that
   * buries it does not. It is also a system category the store refuses to
   * delete, which is why it survives the retirement below.
   */
  { id: 'OTHER', label: 'Other', active: true, createdAt: '2026-01-01' },
];
