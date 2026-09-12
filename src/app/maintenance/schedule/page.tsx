import {redirect} from 'next/navigation';

/**
 * The schedule is a tab on the job board now, not a screen of its own.
 *
 * Kept as a redirect rather than deleted because this URL was in the rail
 * until recently, so it is in somebody's bookmarks and somebody's history.
 * The board's own route rule decides who may go on from here.
 */
export default function MaintenanceSchedulePage() {
  redirect('/maintenance/jobs');
}
