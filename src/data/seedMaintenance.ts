import { MaintenanceJob } from '../types';

/**
 * Demo maintenance jobs, so the module has something to show on first run.
 * Deliberately spread across the three states — reported, in progress and
 * completed — and across two months, so the month-end report has data on
 * either side of a boundary.
 */

/** ISO timestamp for a plain date and 24-hour time, in the reader's own zone. */
function at(date: string, hour: number, minute: number): string {
  const d = new Date(`${date}T00:00:00`);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

export const SEED_MAINTENANCE: MaintenanceJob[] = [
  {
    id: 'mnt-seed-1',
    branchName: "Zahra's Kitchen",
    title: 'Dining area AC not cooling',
    details:
      'Split AC over the dining counter runs but blows warm air. Room temperature climbing through service. Filters were cleaned last month.',
    equipment: 'Split AC 2 — dining area',
    category: 'AC_VENTILATION',
    priority: 'high',
    reportedBy: 'A. Rahman',
    reportedAt: at('2026-08-24', 16, 40),
    startedAt: at('2026-08-26', 9, 15),
    completedAt: at('2026-08-26', 12, 5),
    attendedBy: 'Cool Air Services',
    resolutionNote:
      'Gas recharged and a leaking joint on the outdoor unit resealed. Cooling checked at 18°C on return air.',
    cost: 450,
    photo: null,
  },
  {
    id: 'mnt-seed-2',
    branchName: 'Mafraq Gujrat Restaurant',
    title: 'Hand wash tap not running',
    details:
      'Kitchen hand wash basin tap gives no water. Staff are using the prep sink instead, which is not acceptable for hand washing.',
    equipment: 'Hand wash basin — kitchen entrance',
    category: 'PLUMBING',
    priority: 'critical',
    reportedBy: 'M. Farooq',
    reportedAt: at('2026-08-17', 14, 20),
    startedAt: at('2026-08-18', 8, 0),
    completedAt: at('2026-08-18', 9, 30),
    attendedBy: 'In-house maintenance',
    resolutionNote: 'Blocked aerator cleared and washer replaced. Flow restored and tested.',
    cost: 60,
    photo: null,
    sourceInspectionId: 'insp-seed-4',
  },
  {
    id: 'mnt-seed-3',
    branchName: 'Mafraq Gujrat Restaurant',
    title: 'Walk-in chiller holding above 5°C',
    details:
      'Chiller reading 8°C first thing in the morning and not pulling down. Stock moved to the second chiller as a precaution.',
    equipment: 'Walk-in chiller — dry store side',
    category: 'REFRIGERATION',
    priority: 'critical',
    reportedBy: 'M. Farooq',
    reportedAt: at('2026-09-02', 7, 45),
    startedAt: at('2026-09-02', 15, 30),
    completedAt: null,
    attendedBy: null,
    resolutionNote: null,
    cost: null,
    photo: null,
  },
  {
    id: 'mnt-seed-4',
    branchName: "Zahra's Kitchen",
    title: 'Kitchen wall tiles cracked and lifting',
    details:
      'Outside wall tiles by the pizza kitchen are cracked and coming away. Surface cannot be cleaned properly in that state.',
    equipment: 'Wall tiling — pizza kitchen exterior',
    category: 'STRUCTURAL',
    priority: 'medium',
    reportedBy: 'A. Rahman',
    reportedAt: at('2026-09-01', 10, 10),
    startedAt: null,
    completedAt: null,
    attendedBy: null,
    resolutionNote: null,
    cost: null,
    photo: null,
    sourceInspectionId: 'insp-seed-3',
  },
  {
    id: 'mnt-seed-5',
    branchName: 'Gujrat Restaurant',
    title: 'Extraction hood fan noisy',
    details:
      'Extraction over the range has developed a loud rattle and pulls less than it used to. Kitchen getting smoky at peak.',
    equipment: 'Extraction hood — main range',
    category: 'AC_VENTILATION',
    priority: 'medium',
    reportedBy: 'S. Iqbal',
    reportedAt: at('2026-09-03', 17, 25),
    startedAt: null,
    completedAt: null,
    attendedBy: null,
    resolutionNote: null,
    cost: null,
    photo: null,
  },
  {
    id: 'mnt-seed-6',
    branchName: 'Naan House Metro',
    title: 'Fly killer unit not lighting',
    details: 'Tube in the fly killer by the back door is dead. Unit otherwise intact.',
    equipment: 'Fly killer — rear entrance',
    category: 'PEST_CONTROL',
    priority: 'low',
    reportedBy: 'A. Rahman',
    reportedAt: at('2026-09-04', 11, 0),
    startedAt: at('2026-09-04', 14, 0),
    completedAt: at('2026-09-04', 14, 25),
    attendedBy: 'In-house maintenance',
    resolutionNote: 'Tube and starter replaced from stock.',
    cost: 35,
    photo: null,
  },
  {
    id: 'mnt-seed-7',
    branchName: 'Gujrat Restaurant',
    title: 'Fire extinguisher service overdue',
    details:
      'Service label on the kitchen extinguisher expired last month. Needs the annual service and a new tag.',
    equipment: 'Dry powder extinguisher — kitchen',
    category: 'FIRE_SAFETY',
    priority: 'high',
    reportedBy: 'S. Iqbal',
    reportedAt: at('2026-09-05', 9, 30),
    startedAt: at('2026-09-06', 10, 0),
    completedAt: at('2026-09-06', 10, 45),
    attendedBy: 'Gulf Fire Safety',
    resolutionNote: 'Serviced, pressure tested and re-tagged. Next service due in 12 months.',
    cost: 120,
    photo: null,
  },
];
