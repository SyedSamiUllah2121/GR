import {
  ChecklistDoc,
  ChecklistList,
  FullSection,
  Item,
  Section,
  Severity,
} from '../types';
import { DEFAULT_CHECKLIST } from '../data/defaultChecklist';
import { ensureEstate } from './estateReset';

/**
 * Bumped whenever the shipped default changes shape, because a stored copy is
 * returned wholesale rather than merged. A v1 doc predates the branch-wide and
 * temperature lists and per-item severity, so it would cap every new report at
 * the items that older checklist happened to define. The old value is left in
 * place rather than migrated.
 */
const CHECKLIST_KEY = 'inspection_log_checklist_v2';
const CHECKLIST_EVENT = 'inspection_log_checklist_change';

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** The stored checklist, falling back to the shipped default on first run. */
export function getChecklist(): ChecklistDoc {
  ensureEstate();
  try {
    const raw = localStorage.getItem(CHECKLIST_KEY);
    if (!raw) return clone(DEFAULT_CHECKLIST);
    const parsed = JSON.parse(raw) as ChecklistDoc;
    if (!parsed || !Array.isArray(parsed.lists)) return clone(DEFAULT_CHECKLIST);
    return parsed;
  } catch {
    return clone(DEFAULT_CHECKLIST);
  }
}

export function saveChecklist(doc: ChecklistDoc): void {
  try {
    localStorage.setItem(CHECKLIST_KEY, JSON.stringify(doc));
    window.dispatchEvent(new Event(CHECKLIST_EVENT));
  } catch (err) {
    console.error('Failed to save checklist:', err);
  }
}

export function resetChecklist(): void {
  try {
    localStorage.removeItem(CHECKLIST_KEY);
    window.dispatchEvent(new Event(CHECKLIST_EVENT));
  } catch (err) {
    console.error('Failed to reset checklist:', err);
  }
}

export function subscribeToChecklist(callback: () => void): () => void {
  const handler = () => callback();
  window.addEventListener(CHECKLIST_EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(CHECKLIST_EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}

// ---------------------------------------------------------------------------
// Derived views
// ---------------------------------------------------------------------------

/** Global id an item is stored under. */
export function globalId(list: ChecklistList, localItemId: number): number {
  return list.idBase + localItemId;
}

/**
 * The live checklist as flat sections with global item ids. `includeArchived`
 * brings back removed lists, sections and items so a past report can still
 * render what it recorded.
 */
export function buildSections(doc: ChecklistDoc, includeArchived = false): FullSection[] {
  return doc.lists
    .filter((list) => includeArchived || !list.archived)
    .flatMap((list) =>
      list.sections
        .filter((section) => includeArchived || !section.archived)
        .map((section) => ({
          listKey: list.key,
          listLabel: list.label,
          key: section.key,
          title: section.title,
          archived: section.archived,
          items: section.items
            .filter((item) => includeArchived || !item.archived)
            .map((item) => ({ ...item, id: globalId(list, item.id) })),
        }))
        // A section with nothing left in it would be an empty step
        .filter((section) => includeArchived || section.items.length > 0)
    );
}

export function flattenItems(sections: FullSection[]): Item[] {
  return sections.flatMap((section) => section.items);
}

export interface ChecklistView {
  doc: ChecklistDoc;
  /** Sections a new inspection walks through, in order. */
  sections: FullSection[];
  /** Items a new inspection covers, in order. */
  items: Item[];
  total: number;
  /** Every item ever defined, archived included, for looking up past answers. */
  allItems: Item[];
  listGroups: { key: string; label: string; sectionIndexes: number[] }[];
  getItem: (id: number) => Item | undefined;
  /** Section (and its list) an item belongs to, for grouping a summary. */
  getSectionOf: (id: number) => FullSection | undefined;
}

export function buildView(doc: ChecklistDoc): ChecklistView {
  const sections = buildSections(doc, false);
  const items = flattenItems(sections);
  const allSections = buildSections(doc, true);
  const allItems = flattenItems(allSections);

  const byId = new Map<number, Item>(allItems.map((item) => [item.id, item] as [number, Item]));
  const sectionById = new Map<number, FullSection>();
  allSections.forEach((section) =>
    section.items.forEach((item) => sectionById.set(item.id, section))
  );

  const listGroups = doc.lists
    .filter((list) => !list.archived)
    .map((list) => ({
      key: list.key,
      label: list.label,
      sectionIndexes: sections.reduce<number[]>((acc, section, idx) => {
        if (section.listKey === list.key) acc.push(idx);
        return acc;
      }, []),
    }))
    .filter((group) => group.sectionIndexes.length > 0);

  return {
    doc,
    sections,
    items,
    total: items.length,
    allItems,
    listGroups,
    getItem: (id) => byId.get(id),
    getSectionOf: (id) => sectionById.get(id),
  };
}

/**
 * 1..N numbering for one inspection. Built from the ids that inspection
 * actually covered, so a past report keeps its numbering after the checklist
 * is edited.
 */
export function numberingFor(itemIds: number[]): (id: number) => number {
  const map = new Map<number, number>(itemIds.map((id, i) => [id, i + 1] as [number, number]));
  return (id) => map.get(id) ?? 0;
}

// ---------------------------------------------------------------------------
// Edits — every one returns a new document, none mutate in place
// ---------------------------------------------------------------------------

function mapList(
  doc: ChecklistDoc,
  listKey: string,
  fn: (list: ChecklistList) => ChecklistList
): ChecklistDoc {
  return { ...doc, lists: doc.lists.map((l) => (l.key === listKey ? fn(l) : l)) };
}

function mapSection(
  doc: ChecklistDoc,
  listKey: string,
  sectionKey: string,
  fn: (section: Section) => Section
): ChecklistDoc {
  return mapList(doc, listKey, (list) => ({
    ...list,
    sections: list.sections.map((s) => (s.key === sectionKey ? fn(s) : s)),
  }));
}

/*
 * What an unnamed thing is called.
 *
 * The editor's name fields write into the document as you type — which is
 * what lets a space be typed at all, since trimming mid-keystroke would eat
 * it — so a name can legitimately be empty for as long as someone is holding
 * the backspace key. These are what it settles on if they walk away, because
 * a category or question with no name at all is one nobody can point at, and
 * an inspector still has to answer it.
 */
export const UNTITLED_LIST = 'Untitled list';
export const UNTITLED_SECTION = 'Untitled category';
export const UNTITLED_ITEM = 'Untitled question';

/** Trims a typed name, falling back when nothing is left of it. */
export function tidyName(value: string, fallback: string): string {
  return value.trim() || fallback;
}

export function addList(doc: ChecklistDoc, label: string): ChecklistDoc {
  const key = `list-${doc.nextIdBase}`;
  const list: ChecklistList = {
    key,
    // Tidied here as well as at the field, because this is the contract: a
    // list added by anything else should not be able to carry padding either
    label: label.trim() || UNTITLED_LIST,
    idBase: doc.nextIdBase,
    nextItemId: 1,
    nextSectionKey: 1,
    sections: [],
  };
  return { ...doc, nextIdBase: doc.nextIdBase + 1000, lists: [...doc.lists, list] };
}

export function renameList(doc: ChecklistDoc, listKey: string, label: string): ChecklistDoc {
  return mapList(doc, listKey, (list) => ({ ...list, label }));
}

export function addSection(doc: ChecklistDoc, listKey: string, title: string): ChecklistDoc {
  return mapList(doc, listKey, (list) => ({
    ...list,
    nextSectionKey: list.nextSectionKey + 1,
    sections: [
      ...list.sections,
      { key: `${list.key}-s${list.nextSectionKey}`, title: title.trim() || UNTITLED_SECTION, items: [] },
    ],
  }));
}

export function renameSection(
  doc: ChecklistDoc,
  listKey: string,
  sectionKey: string,
  title: string
): ChecklistDoc {
  return mapSection(doc, listKey, sectionKey, (section) => ({ ...section, title }));
}

export interface NewItem {
  text: string;
  reasonGroup: Item['reasonGroup'];
  severity: Severity;
  details?: Item['details'];
}

export function addItem(
  doc: ChecklistDoc,
  listKey: string,
  sectionKey: string,
  item: NewItem
): ChecklistDoc {
  const list = doc.lists.find((l) => l.key === listKey);
  if (!list) return doc;
  const id = list.nextItemId;
  return mapList(doc, listKey, (l) => ({
    ...l,
    nextItemId: l.nextItemId + 1,
    sections: l.sections.map((s) =>
      s.key === sectionKey ? { ...s, items: [...s.items, { id, ...item }] } : s
    ),
  }));
}

export function updateItem(
  doc: ChecklistDoc,
  listKey: string,
  sectionKey: string,
  itemId: number,
  patch: Partial<NewItem>
): ChecklistDoc {
  return mapSection(doc, listKey, sectionKey, (section) => ({
    ...section,
    items: section.items.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
  }));
}

/**
 * Remove an item. Kept and marked archived when a past inspection already
 * answered it, so that report still renders; deleted outright otherwise.
 */
export function removeItem(
  doc: ChecklistDoc,
  listKey: string,
  sectionKey: string,
  itemId: number,
  isAnswered: (globalItemId: number) => boolean
): { doc: ChecklistDoc; archived: boolean } {
  const list = doc.lists.find((l) => l.key === listKey);
  if (!list) return { doc, archived: false };
  const archived = isAnswered(globalId(list, itemId));

  const next = mapSection(doc, listKey, sectionKey, (section) => ({
    ...section,
    items: archived
      ? section.items.map((i) => (i.id === itemId ? { ...i, archived: true } : i))
      : section.items.filter((i) => i.id !== itemId),
  }));
  return { doc: next, archived };
}

export function restoreItem(
  doc: ChecklistDoc,
  listKey: string,
  sectionKey: string,
  itemId: number
): ChecklistDoc {
  return mapSection(doc, listKey, sectionKey, (section) => ({
    ...section,
    items: section.items.map((i) => (i.id === itemId ? { ...i, archived: false } : i)),
  }));
}

/** Remove a section, archiving it if any of its items carry history. */
export function removeSection(
  doc: ChecklistDoc,
  listKey: string,
  sectionKey: string,
  isAnswered: (globalItemId: number) => boolean
): { doc: ChecklistDoc; archived: boolean } {
  const list = doc.lists.find((l) => l.key === listKey);
  const section = list?.sections.find((s) => s.key === sectionKey);
  if (!list || !section) return { doc, archived: false };

  const archived = section.items.some((i) => isAnswered(globalId(list, i.id)));
  const next = mapList(doc, listKey, (l) => ({
    ...l,
    sections: archived
      ? l.sections.map((s) =>
          s.key === sectionKey
            ? { ...s, archived: true, items: s.items.map((i) => ({ ...i, archived: true })) }
            : s
        )
      : l.sections.filter((s) => s.key !== sectionKey),
  }));
  return { doc: next, archived };
}

export function restoreSection(
  doc: ChecklistDoc,
  listKey: string,
  sectionKey: string
): ChecklistDoc {
  return mapList(doc, listKey, (list) => ({
    ...list,
    sections: list.sections.map((s) =>
      s.key === sectionKey
        ? { ...s, archived: false, items: s.items.map((i) => ({ ...i, archived: false })) }
        : s
    ),
  }));
}

/** Remove a list, archiving it if any of its items carry history. */
export function removeList(
  doc: ChecklistDoc,
  listKey: string,
  isAnswered: (globalItemId: number) => boolean
): { doc: ChecklistDoc; archived: boolean } {
  const list = doc.lists.find((l) => l.key === listKey);
  if (!list) return { doc, archived: false };

  const archived = list.sections.some((s) => s.items.some((i) => isAnswered(globalId(list, i.id))));
  const next: ChecklistDoc = {
    ...doc,
    lists: archived
      ? doc.lists.map((l) => (l.key === listKey ? { ...l, archived: true } : l))
      : doc.lists.filter((l) => l.key !== listKey),
  };
  return { doc: next, archived };
}

export function restoreList(doc: ChecklistDoc, listKey: string): ChecklistDoc {
  return mapList(doc, listKey, (list) => ({ ...list, archived: false }));
}

function move<T>(arr: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || target < 0 || target >= arr.length) return arr;
  const next = [...arr];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export function moveItem(
  doc: ChecklistDoc,
  listKey: string,
  sectionKey: string,
  itemId: number,
  delta: number
): ChecklistDoc {
  return mapSection(doc, listKey, sectionKey, (section) => ({
    ...section,
    items: move(section.items, section.items.findIndex((i) => i.id === itemId), delta),
  }));
}

export function moveSection(
  doc: ChecklistDoc,
  listKey: string,
  sectionKey: string,
  delta: number
): ChecklistDoc {
  return mapList(doc, listKey, (list) => ({
    ...list,
    sections: move(list.sections, list.sections.findIndex((s) => s.key === sectionKey), delta),
  }));
}

export function moveList(doc: ChecklistDoc, listKey: string, delta: number): ChecklistDoc {
  return { ...doc, lists: move(doc.lists, doc.lists.findIndex((l) => l.key === listKey), delta) };
}

/**
 * Other live checks worded the same as `text`. Guards against the duplication
 * that appears when the same check is added to two lists.
 */
export function findDuplicateText(
  doc: ChecklistDoc,
  text: string,
  ignore?: { listKey: string; itemId: number }
): { listLabel: string; sectionTitle: string }[] {
  const needle = text.trim().toLowerCase();
  if (!needle) return [];

  const hits: { listLabel: string; sectionTitle: string }[] = [];
  doc.lists.forEach((list) => {
    if (list.archived) return;
    list.sections.forEach((section) => {
      if (section.archived) return;
      section.items.forEach((item) => {
        if (item.archived) return;
        if (ignore && ignore.listKey === list.key && ignore.itemId === item.id) return;
        if (item.text.trim().toLowerCase() === needle) {
          hits.push({ listLabel: list.label, sectionTitle: section.title });
        }
      });
    });
  });
  return hits;
}
