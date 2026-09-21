import { Inspection } from '../types';
import { ensureEstate } from './estateReset';
import { SEED_INSPECTIONS } from '../data/seedData';

const STORAGE_KEYS = {
  // Bumped whenever the set of checklist items changes, because records are
  // keyed by global item id and an older record would read as half-unanswered.
  //   v2  one inspection covers every list; answers keyed by global item id
  //   v3  per-item severity added, seeded history for repeat-issue escalation
  //   v4  duplicate checks removed, shared ones moved to the branch-wide list
  //   v5  checklist became editable; records freeze the items they covered
  //   v6  visits record inspector, type and start/submit times; the default
  //       checklist grew to 61 items, so v5 records read as partly uncovered
  //   v7  visits are a Monday round or a surprise visit, and carry who they
  //       were assigned to, who submitted them and when they were locked.
  //       v6 records have none of that, so they would all read as unassigned
  //       Monday rounds and an inspector would see an empty list.
  // Older records are left in place rather than migrated.
  INSPECTIONS: 'inspection_log_records_v7',
  ACTIVE_DRAFT: 'inspection_log_draft_v7',
};

/*
 * Sign-in lives in services/session.ts, which names an account rather than
 * setting a boolean. It is a separate module because it depends on the user
 * store, and the user store depends on this one for inspection counts —
 * keeping them apart is what stops that becoming a cycle.
 */

// Retrieve all inspections (seeding if empty)
export function getInspections(): Inspection[] {
  ensureEstate();
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.INSPECTIONS);
    if (!raw) {
      localStorage.setItem(STORAGE_KEYS.INSPECTIONS, JSON.stringify(SEED_INSPECTIONS));
      return SEED_INSPECTIONS;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      localStorage.setItem(STORAGE_KEYS.INSPECTIONS, JSON.stringify(SEED_INSPECTIONS));
      return SEED_INSPECTIONS;
    }
    return parsed;
  } catch (err) {
    console.error('Failed to read inspections:', err);
    return SEED_INSPECTIONS;
  }
}

export function getInspectionById(id: string): Inspection | null {
  // Check active draft first
  const draft = getActiveDraft();
  if (draft && draft.id === id) {
    return draft;
  }

  const all = getInspections();
  return all.find((i) => i.id === id) || null;
}

export function saveInspection(inspection: Inspection): void {
  try {
    const all = getInspections();
    const idx = all.findIndex((i) => i.id === inspection.id);
    let updated: Inspection[];
    if (idx >= 0) {
      updated = [...all];
      updated[idx] = inspection;
    } else {
      // New inspections placed at the top (newest first)
      updated = [inspection, ...all];
    }
    localStorage.setItem(STORAGE_KEYS.INSPECTIONS, JSON.stringify(updated));
    notifyStorageChange();
  } catch (err) {
    console.error('Failed to save inspection:', err);
  }
}

export function deleteInspection(id: string): void {
  try {
    const all = getInspections();
    const filtered = all.filter((i) => i.id !== id);
    localStorage.setItem(STORAGE_KEYS.INSPECTIONS, JSON.stringify(filtered));
    notifyStorageChange();
  } catch (err) {
    console.error('Failed to delete inspection:', err);
  }
}

// Draft storage
export function getActiveDraft(): Inspection | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.ACTIVE_DRAFT);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (err) {
    console.error('Failed to get active draft:', err);
    return null;
  }
}

export function saveActiveDraft(draft: Inspection): void {
  try {
    localStorage.setItem(STORAGE_KEYS.ACTIVE_DRAFT, JSON.stringify(draft));
    notifyStorageChange();
  } catch (err) {
    console.error('Failed to save active draft:', err);
  }
}

export function clearActiveDraft(): void {
  try {
    localStorage.removeItem(STORAGE_KEYS.ACTIVE_DRAFT);
    notifyStorageChange();
  } catch (err) {
    console.error('Failed to clear active draft:', err);
  }
}

// Custom event for reactive UI updates across same-window components
const STORAGE_EVENT_NAME = 'inspection_log_store_change';

/**
 * Tells every screen in this tab that stored data changed.
 *
 * Exported because the session module signs people in and out, and the
 * chrome watches this event to notice.
 */
export function notifyStorageChange(): void {
  window.dispatchEvent(new Event(STORAGE_EVENT_NAME));
}

export function subscribeToStorage(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener(STORAGE_EVENT_NAME, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(STORAGE_EVENT_NAME, handler);
    window.removeEventListener('storage', handler);
  };
}
