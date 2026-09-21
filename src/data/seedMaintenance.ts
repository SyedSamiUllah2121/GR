import { MaintenanceJob } from '../types';

/**
 * The jobs a fresh installation starts with: none.
 *
 * This file used to hold seven hand-written breakdowns and, generated beside
 * them, one completed service for every asset under every plan that covered
 * it. That was defensible while the register was a demo — it gave the board,
 * the overview and the month-end report something to show, and it kept the
 * first sweep from raising ninety overdue services at once.
 *
 * It stopped being defensible the moment the register became real. The same
 * generator against 302 actual assets would write some six hundred completed
 * jobs, each naming a real unit at a real branch, each claiming a service on
 * a date, each with a contractor's name and a note reading "Cleaned, checked
 * and tested". They would be indistinguishable from work that happened. They
 * would be counted by the month-end report, they would anchor every schedule
 * in the estate, and the first person to query one would be told by this app
 * that a fitter attended a kitchen in Mussafah on a day nobody did.
 *
 * An empty board on the first morning is the honest state of an estate whose
 * maintenance has not been recorded here yet, and it fills up the first time
 * somebody records something. The register is not empty — 302 assets, their
 * locations, their makes and the register's own service wording are all
 * there — so there is plenty to look at; it is the *work* that has to be
 * earned rather than seeded.
 *
 * What the register does say about servicing is carried on the assets
 * themselves: `serviceStatus` and `statusNote` hold the master document's own
 * words, and `lastServicedOn` gives the schedule a real date to count from for
 * the 47 air conditioners that have one. That is the difference — a date
 * transcribed from the operator's document, rather than a job invented here.
 */
export const SEED_MAINTENANCE: MaintenanceJob[] = [];
