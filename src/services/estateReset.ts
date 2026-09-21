/**
 * Clears everything this app stored before the real register arrived.
 *
 * The app shipped for months against an invented estate: seven branches that
 * do not exist, ninety-eight appliances nobody owns, thirteen trades chosen
 * before there was anything to file under them, and demo inspections and jobs
 * generated to make the screens look inhabited. A browser that ran that build
 * is full of it.
 *
 * Earlier this was handled by migrating — matching the old records against the
 * new ones, keeping whatever looked like the operator's own work, archiving
 * what history pointed at. That is the right instinct when an estate grows a
 * branch. It is the wrong one here, because nothing in the old store was ever
 * real: preserving it means carrying invented assets and invented services
 * into a register that is now the operator's actual paperwork, where a fitter
 * cannot tell which rows are which.
 *
 * So the old store is removed rather than reconciled. Every key this app owns
 * goes, once, and every store then seeds itself from the shipped estate as if
 * the browser had never run the app before.
 *
 * Deliberately total, and worth being plain about what that costs: it clears
 * the signed-in session, so everybody signs in again, and it clears any
 * inspection or job recorded against the demo estate. That is the point —
 * those records name branches that do not exist.
 *
 * Runs at most once. The marker is the only key that survives it, and it is
 * written last, so a purge interrupted half way is simply repeated on the next
 * load rather than leaving a store half-cleared and marked done.
 */

const MARKER = 'inspection_log_estate_v2';
const PREFIX = 'inspection_log_';

/** True once the purge has run in this browser. */
function alreadyReset(): boolean {
  try {
    return localStorage.getItem(MARKER) !== null;
  } catch {
    /*
     * Storage unreadable. Claim it is done, because the alternative is trying
     * to clear a store that cannot be read on every single call.
     */
    return true;
  }
}

/**
 * Removes every key this app owns, unless that has already happened.
 *
 * Called at the top of each store's read. After the first call it is a single
 * `getItem` against a key that is always present, which is cheap enough to sit
 * in front of a getter that screens call while rendering.
 */
export function ensureEstate(): void {
  if (typeof window === 'undefined') return;
  if (alreadyReset()) return;

  try {
    /*
     * Collected before anything is removed. Deleting while walking the index
     * shortens the list underneath the walk, and every second key survives —
     * the classic version of this bug, and here it would leave half the demo
     * estate in place looking like data somebody meant to keep.
     */
    const doomed: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (key && key.startsWith(PREFIX) && key !== MARKER) doomed.push(key);
    }

    doomed.forEach((key) => localStorage.removeItem(key));

    // Written last, so an interrupted purge repeats rather than half-applying
    localStorage.setItem(MARKER, new Date().toISOString());
  } catch (err) {
    console.error('Failed to clear the previous estate:', err);
    // Marker deliberately not written: this is retried on the next read
  }
}
