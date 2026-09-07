'use client';

import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Plus,
  RotateCcw,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  ChecklistDoc,
  Item,
  REASON_GROUPS,
  REASON_GROUP_KEYS,
  ReasonGroup,
  SEVERITY_KEYS,
  Severity,
} from '../types';
import {
  addItem,
  addList,
  addSection,
  findDuplicateText,
  getChecklist,
  globalId,
  moveItem,
  moveList,
  moveSection,
  removeItem,
  removeList,
  removeSection,
  renameList,
  renameSection,
  resetChecklist,
  restoreItem,
  restoreList,
  restoreSection,
  saveChecklist,
  subscribeToChecklist,
  updateItem,
} from '../services/checklistStore';
import { SEVERITY_LABEL } from '../services/priority';
import { getInspections } from '../services/storage';
import { PriorityBadge } from './PriorityBadge';
import { useToast } from './ToastProvider';

/** Item ids that any saved inspection has recorded an answer for. */
function answeredItemIds(): Set<number> {
  const ids = new Set<number>();
  getInspections().forEach((inspection) =>
    Object.keys(inspection.answers).forEach((key) => ids.add(Number(key)))
  );
  return ids;
}

const inputClass =
  'w-full px-3 py-2 bg-white border border-[#DEDACB] rounded-md text-sm text-[#242217] placeholder:text-[#635E4F]/50 focus:outline-none focus:border-[#2F5233] focus:ring-1 focus:ring-[#2F5233]';

const iconBtnClass =
  'p-1.5 rounded-md border border-[#DEDACB] bg-white text-[#635E4F] hover:bg-[#F5F3EC] hover:text-[#242217] transition-colors cursor-pointer disabled:opacity-35 disabled:cursor-not-allowed';

export const ChecklistEditorScreen: React.FC = () => {
  const showToast = useToast();
  const [doc, setDoc] = useState<ChecklistDoc>(() => getChecklist());
  const [answered, setAnswered] = useState<Set<number>>(() => new Set());
  const [showArchived, setShowArchived] = useState(false);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [draftItem, setDraftItem] = useState<
    Record<string, { text: string; reasonGroup: ReasonGroup; severity: Severity }>
  >({});

  useEffect(() => {
    const refresh = () => {
      setDoc(getChecklist());
      setAnswered(answeredItemIds());
    };
    refresh();
    return subscribeToChecklist(refresh);
  }, []);

  // Every edit writes straight through, the same as answering a checklist item
  const commit = (next: ChecklistDoc, message?: string) => {
    setDoc(next);
    saveChecklist(next);
    if (message) showToast(message);
  };

  const isAnswered = (id: number) => answered.has(id);

  const handleReset = () => {
    if (
      !window.confirm(
        'Reset the checklist to the shipped default? Questions you have added will be lost. Past inspection records are not affected.'
      )
    ) {
      return;
    }
    resetChecklist();
    setDoc(getChecklist());
    showToast('Checklist reset to default');
  };

  const removedNotice = (archived: boolean, what: string) =>
    archived
      ? `${what} removed — kept on past reports that already answered it`
      : `${what} deleted`;

  const totalActive = doc.lists
    .filter((l) => !l.archived)
    .reduce(
      (n, l) =>
        n +
        l.sections
          .filter((s) => !s.archived)
          .reduce((m, s) => m + s.items.filter((i) => !i.archived).length, 0),
      0
    );

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="min-h-[5rem] bg-white border-b border-[#DEDACB] flex flex-col sm:flex-row sm:items-center justify-between px-6 md:px-10 shrink-0 gap-4 py-4 sm:py-0">
        <div>
          <h2 className="text-xl font-bold text-[#242217]">Checklist</h2>
          <p className="text-[#635E4F] text-xs mt-0.5">
            {totalActive} question{totalActive === 1 ? '' : 's'} — every branch runs this same list
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowArchived((v) => !v)}
            className="px-3 py-2 text-xs font-semibold text-[#635E4F] hover:text-[#242217] border border-[#DEDACB] rounded-md hover:bg-[#F5F3EC] transition-colors cursor-pointer"
          >
            {showArchived ? 'Hide removed' : 'Show removed'}
          </button>
          <button
            id="checklist-reset-btn"
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#9C3B2E] border border-[#9C3B2E]/30 rounded-md hover:bg-[#F4E4DF] transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to default</span>
          </button>
        </div>
      </header>

      <div className="p-6 md:p-10 flex-1 flex flex-col gap-6">
        <div className="p-3.5 bg-[#F9F8F4] border border-[#DEDACB] rounded-md text-xs text-[#635E4F]">
          Changes apply to every branch and take effect on the next inspection. Records already
          submitted keep the questions they were inspected against.
        </div>

        {doc.lists.map((list, listIndex) => {
          if (list.archived && !showArchived) return null;
          const listItemCount = list.sections
            .filter((s) => !s.archived)
            .reduce((n, s) => n + s.items.filter((i) => !i.archived).length, 0);

          return (
            <section
              key={list.key}
              id={`list-${list.key}`}
              className={`bg-white border rounded-md shadow-xs ${
                list.archived ? 'border-[#DEDACB] opacity-60' : 'border-[#DEDACB]'
              }`}
            >
              {/* List header */}
              <div className="p-4 md:p-5 border-b border-[#DEDACB] flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setCollapsed((c) => ({ ...c, [list.key]: !c[list.key] }))
                  }
                  className={iconBtnClass}
                  title={collapsed[list.key] ? 'Expand' : 'Collapse'}
                >
                  {collapsed[list.key] ? (
                    <ChevronRight className="w-4 h-4" />
                  ) : (
                    <ChevronDown className="w-4 h-4" />
                  )}
                </button>

                <input
                  aria-label="List name"
                  value={list.label}
                  disabled={list.archived}
                  onChange={(e) => commit(renameList(doc, list.key, e.target.value))}
                  className={`${inputClass} flex-1 min-w-[12rem] font-semibold disabled:bg-[#F5F3EC]`}
                />

                <span className="text-xs text-[#635E4F] whitespace-nowrap">
                  {listItemCount} question{listItemCount === 1 ? '' : 's'}
                </span>

                {list.archived ? (
                  <button
                    type="button"
                    onClick={() => commit(restoreList(doc, list.key), 'List restored')}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-[#2F5233] bg-[#E7EEE4] hover:bg-[#d8e3d4] rounded-md transition-colors cursor-pointer"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>Restore</span>
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => commit(moveList(doc, list.key, -1))}
                      disabled={listIndex === 0}
                      className={iconBtnClass}
                      title="Move list up"
                    >
                      <ChevronUp className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => commit(moveList(doc, list.key, 1))}
                      disabled={listIndex === doc.lists.length - 1}
                      className={iconBtnClass}
                      title="Move list down"
                    >
                      <ChevronDown className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        if (!window.confirm(`Remove the list "${list.label}" and everything in it?`))
                          return;
                        const { doc: next, archived } = removeList(doc, list.key, isAnswered);
                        commit(next, removedNotice(archived, 'List'));
                      }}
                      className="p-1.5 rounded-md border border-[#9C3B2E]/30 text-[#9C3B2E] hover:bg-[#F4E4DF] transition-colors cursor-pointer"
                      title="Remove list"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {!collapsed[list.key] && (
                <div className="divide-y divide-[#DEDACB]">
                  {list.sections.map((section, sectionIndex) => {
                    if (section.archived && !showArchived) return null;
                    const draftKey = `${list.key}::${section.key}`;
                    const draft =
                      draftItem[draftKey] ??
                      { text: '', reasonGroup: 'CLEANING' as ReasonGroup, severity: 'medium' as Severity };
                    const draftDupes = findDuplicateText(doc, draft.text);

                    return (
                      <div
                        key={section.key}
                        className={`p-4 md:p-5 ${section.archived ? 'opacity-60 bg-[#F9F8F4]' : ''}`}
                      >
                        {/* Section header */}
                        <div className="flex flex-wrap items-center gap-2.5 mb-3">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-[#635E4F] shrink-0">
                            Category
                          </span>
                          <input
                            aria-label="Category name"
                            value={section.title}
                            disabled={section.archived}
                            onChange={(e) =>
                              commit(renameSection(doc, list.key, section.key, e.target.value))
                            }
                            className={`${inputClass} flex-1 min-w-[12rem] font-semibold disabled:bg-[#F5F3EC]`}
                          />
                          {section.archived ? (
                            <button
                              type="button"
                              onClick={() =>
                                commit(
                                  restoreSection(doc, list.key, section.key),
                                  'Category restored'
                                )
                              }
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-[#2F5233] bg-[#E7EEE4] hover:bg-[#d8e3d4] rounded-md transition-colors cursor-pointer"
                            >
                              <Undo2 className="w-3.5 h-3.5" />
                              <span>Restore</span>
                            </button>
                          ) : (
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => commit(moveSection(doc, list.key, section.key, -1))}
                                disabled={sectionIndex === 0}
                                className={iconBtnClass}
                                title="Move category up"
                              >
                                <ChevronUp className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => commit(moveSection(doc, list.key, section.key, 1))}
                                disabled={sectionIndex === list.sections.length - 1}
                                className={iconBtnClass}
                                title="Move category down"
                              >
                                <ChevronDown className="w-4 h-4" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (
                                    !window.confirm(
                                      `Remove the category "${section.title}" and its questions?`
                                    )
                                  )
                                    return;
                                  const { doc: next, archived } = removeSection(
                                    doc,
                                    list.key,
                                    section.key,
                                    isAnswered
                                  );
                                  commit(next, removedNotice(archived, 'Category'));
                                }}
                                className="p-1.5 rounded-md border border-[#9C3B2E]/30 text-[#9C3B2E] hover:bg-[#F4E4DF] transition-colors cursor-pointer"
                                title="Remove category"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                        </div>

                        {/* Questions */}
                        <div className="border border-[#DEDACB] rounded-md divide-y divide-[#DEDACB] overflow-hidden">
                          {section.items.filter((i) => showArchived || !i.archived).length === 0 ? (
                            <p className="px-3.5 py-3 text-xs text-[#635E4F] bg-[#F9F8F4]">
                              No questions in this category yet.
                            </p>
                          ) : (
                            section.items.map((item, itemIndex) => {
                              if (item.archived && !showArchived) return null;
                              const dupes = findDuplicateText(doc, item.text, {
                                listKey: list.key,
                                itemId: item.id,
                              });

                              return (
                                <ItemRow
                                  key={item.id}
                                  item={item}
                                  duplicateCount={dupes.length}
                                  hasHistory={isAnswered(globalId(list, item.id))}
                                  canMoveUp={itemIndex > 0}
                                  canMoveDown={itemIndex < section.items.length - 1}
                                  onChange={(patch) =>
                                    commit(updateItem(doc, list.key, section.key, item.id, patch))
                                  }
                                  onMove={(delta) =>
                                    commit(moveItem(doc, list.key, section.key, item.id, delta))
                                  }
                                  onRemove={() => {
                                    const { doc: next, archived } = removeItem(
                                      doc,
                                      list.key,
                                      section.key,
                                      item.id,
                                      isAnswered
                                    );
                                    commit(next, removedNotice(archived, 'Question'));
                                  }}
                                  onRestore={() =>
                                    commit(
                                      restoreItem(doc, list.key, section.key, item.id),
                                      'Question restored'
                                    )
                                  }
                                />
                              );
                            })
                          )}
                        </div>

                        {/* Add a question */}
                        {!section.archived && (
                          <div className="mt-3 flex flex-col sm:flex-row gap-2 items-stretch sm:items-start">
                            <div className="flex-1">
                              <input
                                aria-label="New question"
                                placeholder="Add a question to this category..."
                                value={draft.text}
                                onChange={(e) =>
                                  setDraftItem((d) => ({
                                    ...d,
                                    [draftKey]: { ...draft, text: e.target.value },
                                  }))
                                }
                                className={inputClass}
                              />
                              {draftDupes.length > 0 && (
                                <p className="mt-1 text-xs text-[#8A6318] flex items-start gap-1.5">
                                  <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                                  <span>
                                    Already asked in {draftDupes[0].listLabel} /{' '}
                                    {draftDupes[0].sectionTitle}
                                  </span>
                                </p>
                              )}
                            </div>
                            <select
                              aria-label="Reason group for new question"
                              value={draft.reasonGroup}
                              onChange={(e) =>
                                setDraftItem((d) => ({
                                  ...d,
                                  [draftKey]: { ...draft, reasonGroup: e.target.value as ReasonGroup },
                                }))
                              }
                              className={`${inputClass} sm:w-36`}
                            >
                              {REASON_GROUP_KEYS.map((g) => (
                                <option key={g} value={g}>
                                  {g}
                                </option>
                              ))}
                            </select>
                            <select
                              aria-label="Priority for new question"
                              value={draft.severity}
                              onChange={(e) =>
                                setDraftItem((d) => ({
                                  ...d,
                                  [draftKey]: { ...draft, severity: e.target.value as Severity },
                                }))
                              }
                              className={`${inputClass} sm:w-32`}
                            >
                              {SEVERITY_KEYS.map((s) => (
                                <option key={s} value={s}>
                                  {SEVERITY_LABEL[s]}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              disabled={!draft.text.trim()}
                              onClick={() => {
                                commit(
                                  addItem(doc, list.key, section.key, {
                                    text: draft.text.trim(),
                                    reasonGroup: draft.reasonGroup,
                                    severity: draft.severity,
                                  }),
                                  'Question added'
                                );
                                setDraftItem((d) => ({ ...d, [draftKey]: { ...draft, text: '' } }));
                              }}
                              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-[#2F5233] hover:bg-[#3d6a42] disabled:bg-[#DEDACB] disabled:text-[#635E4F] disabled:cursor-not-allowed text-white text-xs font-semibold rounded-md transition-colors cursor-pointer shrink-0"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add</span>
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}

                  {/* Add a category */}
                  {!list.archived && (
                    <div className="p-4 md:p-5 bg-[#F9F8F4]">
                      <AddRow
                        placeholder="Add a category to this list..."
                        buttonLabel="Add category"
                        onAdd={(title) => commit(addSection(doc, list.key, title), 'Category added')}
                      />
                    </div>
                  )}
                </div>
              )}
            </section>
          );
        })}

        {/* Add a list */}
        <div className="bg-white border border-dashed border-[#DEDACB] rounded-md p-4 md:p-5">
          <AddRow
            placeholder="Add a new list, e.g. Washroom and facilities..."
            buttonLabel="Add list"
            onAdd={(label) => commit(addList(doc, label), 'List added')}
          />
        </div>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------

interface ItemRowProps {
  item: Item;
  duplicateCount: number;
  hasHistory: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (patch: Partial<{ text: string; reasonGroup: ReasonGroup; severity: Severity }>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
  onRestore: () => void;
}

const ItemRow: React.FC<ItemRowProps> = ({
  item,
  duplicateCount,
  hasHistory,
  canMoveUp,
  canMoveDown,
  onChange,
  onMove,
  onRemove,
  onRestore,
}) => (
  <div className={`p-3 flex flex-col lg:flex-row lg:items-center gap-2 ${item.archived ? 'bg-[#F9F8F4]' : 'bg-white'}`}>
    <div className="flex-1 min-w-0">
      <input
        aria-label="Question text"
        value={item.text}
        disabled={item.archived}
        onChange={(e) => onChange({ text: e.target.value })}
        className={`${inputClass} disabled:bg-[#F5F3EC] disabled:line-through disabled:text-[#635E4F]`}
      />
      {item.archived && (
        <p className="mt-1 text-[10px] font-bold uppercase tracking-wider text-[#635E4F]">
          Removed — still shown on past reports
        </p>
      )}
      {!item.archived && duplicateCount > 0 && (
        <p className="mt-1 text-xs text-[#8A6318] flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
          <span>This exact question is also asked elsewhere</span>
        </p>
      )}
    </div>

    <div className="flex flex-wrap items-center gap-2">
      <select
        aria-label="Reason group"
        value={item.reasonGroup}
        disabled={item.archived}
        onChange={(e) => onChange({ reasonGroup: e.target.value as ReasonGroup })}
        title={`Reasons offered when this is marked No (${REASON_GROUPS[item.reasonGroup].length} options)`}
        className={`${inputClass} w-36 disabled:bg-[#F5F3EC]`}
      >
        {REASON_GROUP_KEYS.map((g) => (
          <option key={g} value={g}>
            {g}
          </option>
        ))}
      </select>

      <select
        aria-label="Priority"
        value={item.severity}
        disabled={item.archived}
        onChange={(e) => onChange({ severity: e.target.value as Severity })}
        title="Base priority if this check fails"
        className={`${inputClass} w-32 disabled:bg-[#F5F3EC]`}
      >
        {SEVERITY_KEYS.map((s) => (
          <option key={s} value={s}>
            {SEVERITY_LABEL[s]}
          </option>
        ))}
      </select>

      <span className="hidden xl:inline-block">
        <PriorityBadge severity={item.severity} size="sm" />
      </span>

      {item.archived ? (
        <button
          type="button"
          onClick={onRestore}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold text-[#2F5233] bg-[#E7EEE4] hover:bg-[#d8e3d4] rounded-md transition-colors cursor-pointer"
        >
          <Undo2 className="w-3.5 h-3.5" />
          <span>Restore</span>
        </button>
      ) : (
        <>
          <button
            type="button"
            onClick={() => onMove(-1)}
            disabled={!canMoveUp}
            className={iconBtnClass}
            title="Move up"
          >
            <ChevronUp className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => onMove(1)}
            disabled={!canMoveDown}
            className={iconBtnClass}
            title="Move down"
          >
            <ChevronDown className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              const warning = hasHistory
                ? 'Remove this question? Past reports that already answered it will keep showing it.'
                : 'Remove this question?';
              if (window.confirm(warning)) onRemove();
            }}
            className="p-1.5 rounded-md border border-[#9C3B2E]/30 text-[#9C3B2E] hover:bg-[#F4E4DF] transition-colors cursor-pointer"
            title="Remove question"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </>
      )}
    </div>
  </div>
);

// ---------------------------------------------------------------------------

const AddRow: React.FC<{
  placeholder: string;
  buttonLabel: string;
  onAdd: (value: string) => void;
}> = ({ placeholder, buttonLabel, onAdd }) => {
  const [value, setValue] = useState('');
  const submit = () => {
    if (!value.trim()) return;
    onAdd(value.trim());
    setValue('');
  };

  return (
    <div className="flex flex-col sm:flex-row gap-2">
      <input
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
        className={inputClass}
      />
      <button
        type="button"
        disabled={!value.trim()}
        onClick={submit}
        className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-[#2F5233] hover:bg-[#3d6a42] disabled:bg-[#DEDACB] disabled:text-[#635E4F] disabled:cursor-not-allowed text-white text-xs font-semibold rounded-md transition-colors cursor-pointer shrink-0"
      >
        <Plus className="w-3.5 h-3.5" />
        <span>{buttonLabel}</span>
      </button>
    </div>
  );
};
