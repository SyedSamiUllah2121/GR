import { ensureEstate } from './estateReset';

/**
 * System settings the main admin controls.
 *
 * One store for the switches that change how the app behaves for everyone,
 * rather than a flag hidden in whichever screen happens to read it. Held in
 * storage so a decision survives a reload, and announced like every other
 * store so a screen showing the setting and a screen obeying it cannot
 * disagree.
 *
 * Only the admin may change these — `can(user, 'settings.manage')` — but
 * everyone is subject to them, so reading is not gated.
 */

const KEY = 'inspection_log_settings_v1';
const EVENT = 'inspection_log_settings_change';

export interface Settings {
  /**
   * Whether a surprise visit may be left to the system to place: the branch
   * drawn from the rotation, the inspector from whoever is carrying least.
   *
   * On by default, because unassisted choice is what the rotation exists to
   * correct — an admin picking every branch by hand drifts towards the ones
   * they already worry about. Turned off, the admin names the branch and the
   * inspector on every visit and the draw is never consulted.
   */
  randomAssignment: boolean;
  /**
   * How often the system raises a surprise visit of its own accord, in days.
   * Zero is off, which is the default: an estate that has never been asked
   * should not start booking its own inspections.
   *
   * The interval is the gap between unannounced visits to the *estate*, not
   * to each branch — which branch it lands on is the rotation's business, and
   * `randomBranch` answers that the same way it answers for one raised by
   * hand. Set to 3, somewhere is visited unannounced every third day.
   *
   * Only meaningful while `randomAssignment` is on, since an automatic visit
   * is by definition one nobody chose: turning the draw off turns this off
   * with it, rather than leaving the system picking branches under a switch
   * that says it may not.
   */
  autoSurpriseDays: number;
}

/** The longest interval worth offering: beyond a year it is not a schedule. */
export const MAX_AUTO_SURPRISE_DAYS = 365;

export const DEFAULT_SETTINGS: Settings = {
  randomAssignment: true,
  autoSurpriseDays: 0,
};

/**
 * The interval, made safe to act on.
 *
 * Clamped and rounded rather than rejected, because this number decides how
 * often the app writes records by itself: a stored `2.5`, `-1` or `1e9` from
 * a hand-edited store should land on something sane, not stop the sweep or
 * let it run away.
 */
function readDays(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_SETTINGS.autoSurpriseDays;
  }
  return Math.min(Math.max(Math.round(value), 0), MAX_AUTO_SURPRISE_DAYS);
}

function notify(): void {
  window.dispatchEvent(new Event(EVENT));
}

/**
 * The settings in force.
 *
 * Merged over the defaults rather than trusted wholesale, so a stored object
 * written before a setting existed still answers for it, and a corrupted one
 * falls back to sensible behaviour instead of undefined.
 */
export function getSettings(): Settings {
  ensureEstate();
  if (typeof window === 'undefined') return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    if (!parsed || typeof parsed !== 'object') return DEFAULT_SETTINGS;
    return {
      randomAssignment:
        typeof parsed.randomAssignment === 'boolean'
          ? parsed.randomAssignment
          : DEFAULT_SETTINGS.randomAssignment,
      autoSurpriseDays: readDays(parsed.autoSurpriseDays),
    };
  } catch (err) {
    console.error('Failed to read settings:', err);
    return DEFAULT_SETTINGS;
  }
}

/** Writes one setting, leaving the rest as they were. */
export function saveSetting<K extends keyof Settings>(key: K, value: Settings[K]): boolean {
  const next: Settings = { ...getSettings(), [key]: value };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
    notify();
    return true;
  } catch (err) {
    console.error('Failed to save settings:', err);
    return false;
  }
}

/**
 * Whether the system may place a surprise visit itself.
 *
 * Asked both where the choice is offered and again where it is acted on, so
 * a form left open while the switch was thrown cannot slip a draw past it.
 * The draw functions themselves stay unaware of this: they answer "which
 * branch is next in the rotation", which is a different question from
 * whether anyone is allowed to ask.
 */
export function isRandomAssignmentOn(): boolean {
  return getSettings().randomAssignment;
}

/**
 * How many days apart the system raises surprise visits, or 0 for never.
 *
 * Reads the draw's switch as well as the number, so there is one answer to
 * "is the system raising visits" rather than two that have to be checked
 * together at every call site.
 */
export function autoSurpriseIntervalDays(): number {
  const settings = getSettings();
  return settings.randomAssignment ? settings.autoSurpriseDays : 0;
}

export function subscribeToSettings(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
