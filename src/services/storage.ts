import { Inspection } from '../types';
import { SEED_INSPECTIONS } from '../data/seedData';

const STORAGE_KEYS = {
  AUTH: 'inspection_log_auth',
  INSPECTIONS: 'inspection_log_records_v1',
  ACTIVE_DRAFT: 'inspection_log_draft_v1',
};

// Check if user is authenticated
export function isAuthenticated(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEYS.AUTH) === 'true';
  } catch {
    return false;
  }
}

export function setAuthenticated(val: boolean): void {
  try {
    if (val) {
      localStorage.setItem(STORAGE_KEYS.AUTH, 'true');
    } else {
      localStorage.removeItem(STORAGE_KEYS.AUTH);
    }
    notifyStorageChange();
  } catch (err) {
    console.error('Failed to set auth state:', err);
  }
}

// Retrieve all inspections (seeding if empty)
export function getInspections(): Inspection[] {
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

function notifyStorageChange(): void {
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
