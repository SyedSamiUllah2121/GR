'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertTriangle,
  Bug,
  Check,
  ChevronDown,
  ClipboardCheck,
  ClipboardList,
  Droplets,
  Eye,
  EyeOff,
  FileText,
  Info,
  Package,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Thermometer,
  Tag,
  Trash2,
  Undo2,
  User,
  UtensilsCrossed,
  X,
  Zap,
} from 'lucide-react';
import {
  ChecklistDoc,
  ChecklistList,
  Item,
  ItemDetail,
  REASON_GROUPS,
  REASON_GROUP_KEYS,
  ReasonGroup,
  SEVERITY_KEYS,
  Section,
  Severity,
} from '../types';
import {
  NewItem,
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
  UNTITLED_ITEM,
  UNTITLED_LIST,
  UNTITLED_SECTION,
  renameList,
  renameSection,
  tidyName,
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
import { DetailFields } from './DetailFields';
import { PriorityBadge } from './PriorityBadge';
import { useToast } from './ToastProvider';
import { useConfirm } from './ConfirmProvider';
import { BUTTON, Card, PageHeader } from './ui';
import { CountUp, EASE_OUT, Reveal, Stagger, StaggerItem, t } from './motion';

/**
 * Editing the master checklist.
 *
 * Read first, edit second. The screen used to render every question as a text
 * box with two dropdowns and three buttons beside it — sixty-one of those at
 * once, which is a wall of controls rather than a checklist you can read. Now
 * a category is a closed card showing its name and how many questions it
 * holds; open one and its questions read as plain lines, with the controls
 * arriving on the row you are actually pointing at.
 *
 * Adding is behind a button for the same reason: an always-open "add" row at
 * the foot of every category is a form you never asked for, and there are
 * seventeen of them.
 */

/** Item ids that any saved inspection has recorded an answer for. */
function answeredItemIds(): Set<number> {
  const ids = new Set<number>();
  getInspections().forEach((inspection) =>
    Object.keys(inspection.answers).forEach((key) => ids.add(Number(key)))
  );
  return ids;
}

/**
 * A mark for a category, guessed from its name. Purely to make a column of
 * cards scannable — anything unrecognised gets the neutral clipboard rather
 * than a wrong picture.
 */
const SECTION_ICONS: [RegExp, React.ComponentType<{ className?: string }>][] = [
  [/temperature|chiller|freezer|cold/i, Thermometer],
  [/pest|waste|bin|rubbish|external/i, Bug],
  [/record|register|logbook/i, FileText],
  [/fire|safety|extinguish/i, ShieldCheck],
  [/equipment|electric|security|electronic|appliance/i, Zap],
  [/guest|dining|counter|facilit|washroom|toilet/i, Sparkles],
  [/food|labell?ing|storage|handling|cooking|holding|menu/i, UtensilsCrossed],
  [/personal|uniform|staff|presentation|hygiene/i, User],
  [/clean|wash|sanit/i, Droplets],
  [/supply|stock|packag|deliver/i, Package],
];

function iconFor(title: string): React.ComponentType<{ className?: string }> {
  const hit = SECTION_ICONS.find(([pattern]) => pattern.test(title));
  return hit ? hit[1] : ClipboardCheck;
}

const inputClass =
  'w-full h-10 px-3 bg-white border border-[#E4E6EB] rounded-xl text-sm text-[#17181D] placeholder:text-[#9CA1A9] shadow-xs focus:outline-none focus:border-[#C8202D] focus:ring-4 focus:ring-[#C8202D]/10 transition-[border-color,box-shadow]';

/**
 * Controls that read as plain text until you reach for them. Keeps a question
 * directly editable without drawing a box around all sixty-one of them.
 */
const quietField =
  'bg-transparent border border-transparent rounded-lg hover:border-[#E4E6EB] hover:bg-white focus:bg-white focus:outline-none focus:border-[#C8202D] focus:ring-4 focus:ring-[#C8202D]/10 transition-[border-color,box-shadow,background-color]';

const iconBtnClass =
  'w-8 h-8 rounded-lg flex items-center justify-center text-[#9CA1A9] hover:bg-[#F4F5F7] hover:text-[#17181D] transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed disabled:hover:bg-transparent';

/** The small red "Add" button the inline forms end with. */
const addBtnClass =
  'inline-flex items-center justify-center gap-1.5 h-10 px-4 bg-[#C8202D] hover:bg-[#A81823] disabled:bg-[#E4E6EB] disabled:text-[#9CA1A9] disabled:shadow-none disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-[0_6px_16px_-8px_rgba(200,32,45,0.6)] transition-colors cursor-pointer';

export const ChecklistEditorScreen: React.FC = () => {
  const showToast = useToast();
  const confirm = useConfirm();
  const [doc, setDoc] = useState<ChecklistDoc>(() => getChecklist());
  const [answered, setAnswered] = useState<Set<number>>(() => new Set());
  const [showArchived, setShowArchived] = useState(false);
  /** Categories are closed until asked for, so the page opens as an outline. */
  const [open, setOpen] = useState<Record<string, boolean>>({});

  useEffect(() => {
    const refresh = () => {
      setDoc(getChecklist());
      setAnswered(answeredItemIds());
    };
    refresh();
    return subscribeToChecklist(refresh);
  }, []);

  /*
   * Every edit writes straight through, the same as answering a checklist
   * item. The screen only moves once the write has landed: showing an edit
   * the store refused, with its success toast, left the admin believing in a
   * question every branch would never see.
   */
  const commit = (next: ChecklistDoc, message?: string) => {
    if (!saveChecklist(next)) {
      showToast('Could not save the checklist — this browser’s storage is full', 'error');
      return;
    }
    setDoc(next);
    if (message) showToast(message);
  };

  const isAnswered = (id: number) => answered.has(id);

  const handleReset = async () => {
    const ok = await confirm({
      title: 'Reset the checklist to the shipped default?',
      body: 'Questions you have added will be lost. Past inspection records are not affected.',
      confirmLabel: 'Reset checklist',
    });
    if (!ok) return;
    if (!resetChecklist()) {
      showToast('Could not reset the checklist — try again', 'error');
      return;
    }
    setDoc(getChecklist());
    showToast('Checklist reset to default');
  };

  const removedNotice = (archived: boolean, what: string) =>
    archived
      ? `${what} removed — kept on past reports that already answered it`
      : `${what} deleted`;

  const visibleLists = doc.lists.filter((l) => showArchived || !l.archived);
  const totalActive = useMemo(
    () =>
      doc.lists
        .filter((l) => !l.archived)
        .reduce(
          (n, l) =>
            n +
            l.sections
              .filter((s) => !s.archived)
              .reduce((m, s) => m + s.items.filter((i) => !i.archived).length, 0),
          0
        ),
    [doc]
  );

  const activeLists = doc.lists.filter((l) => !l.archived);
  const activeSections = activeLists.reduce(
    (n, l) => n + l.sections.filter((s) => !s.archived).length,
    0
  );

  return (
    <div className="p-5 sm:p-6 md:p-8 lg:p-10 flex-1 space-y-6 max-w-[1440px] w-full mx-auto">
      <Reveal>
        <PageHeader
          eyebrow="Configuration"
          title="Checklist"
          subtitle={
            <>
              {totalActive} question{totalActive === 1 ? '' : 's'} across {activeLists.length}{' '}
              lists. Every branch runs this same checklist, and changes are saved automatically.
            </>
          }
          actions={
            <>
              <button
                type="button"
                onClick={() => setShowArchived((v) => !v)}
                aria-pressed={showArchived}
                className={BUTTON.secondary}
              >
                {showArchived ? (
                  <EyeOff className="w-4 h-4 text-[#6B6F76]" />
                ) : (
                  <Eye className="w-4 h-4 text-[#6B6F76]" />
                )}
                {showArchived ? 'Hide removed' : 'Show removed'}
              </button>
              <button
                id="checklist-reset-btn"
                type="button"
                onClick={handleReset}
                className={`${BUTTON.secondary} text-[#C8202D] hover:border-[#C8202D]/30`}
              >
                <RotateCcw className="w-4 h-4" />
                <span>Reset to default</span>
              </button>
            </>
          }
        />
      </Reveal>

      {/* The outline in three figures, with the one rule every edit here obeys */}
      <Reveal delay={0.05}>
        <Card className="flex flex-col md:flex-row md:items-stretch">
          <dl className="grid grid-cols-3 divide-x divide-[#F0F1F4] md:w-[26rem] shrink-0">
            {[
              { label: 'Lists', value: activeLists.length },
              { label: 'Categories', value: activeSections },
              { label: 'Questions', value: totalActive },
            ].map((stat) => (
              <div key={stat.label} className="px-5 sm:px-6 py-4">
                <dt className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#9CA1A9]">
                  {stat.label}
                </dt>
                <dd className="mt-1 text-[26px] leading-none font-bold tracking-tight text-[#17181D]">
                  <CountUp value={stat.value} />
                </dd>
              </div>
            ))}
          </dl>
          <p className="flex items-start gap-3 px-5 sm:px-6 py-4 border-t md:border-t-0 md:border-l border-[#F0F1F4] text-xs leading-relaxed text-[#6B6F76]">
            <span className="w-8 h-8 rounded-lg bg-[#F4F5F7] text-[#6B6F76] flex items-center justify-center shrink-0">
              <Info className="w-4 h-4" />
            </span>
            <span className="self-center">
              Changes take effect on the next inspection. Records already submitted keep the
              questions they were inspected against.
            </span>
          </p>
        </Card>
      </Reveal>

      <Stagger className="space-y-6">
        {visibleLists.map((list) => {
          const listIndex = doc.lists.indexOf(list);
          return (
            <StaggerItem key={list.key}>
              <ListGroup
                doc={doc}
                list={list}
                listIndex={listIndex}
                showArchived={showArchived}
                open={open}
                setOpen={setOpen}
                commit={commit}
                isAnswered={isAnswered}
                removedNotice={removedNotice}
              />
            </StaggerItem>
          );
        })}
      </Stagger>

      <InlineAdd
        label="Add a list"
        placeholder="e.g. Washroom and facilities"
        onAdd={(value) => commit(addList(doc, value), 'List added')}
      />
    </div>
  );
};

// ---------------------------------------------------------------------------
// One list, e.g. "Kitchen hygiene" — a card whose rows are its categories
// ---------------------------------------------------------------------------

interface ListGroupProps {
  doc: ChecklistDoc;
  list: ChecklistList;
  listIndex: number;
  showArchived: boolean;
  open: Record<string, boolean>;
  setOpen: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  commit: (next: ChecklistDoc, message?: string) => void;
  isAnswered: (id: number) => boolean;
  removedNotice: (archived: boolean, what: string) => string;
}

const ListGroup: React.FC<ListGroupProps> = ({
  doc,
  list,
  listIndex,
  showArchived,
  open,
  setOpen,
  commit,
  isAnswered,
  removedNotice,
}) => {
  const confirm = useConfirm();
  const count = list.sections
    .filter((s) => !s.archived)
    .reduce((n, s) => n + s.items.filter((i) => !i.archived).length, 0);
  const visibleSections = list.sections.filter((s) => showArchived || !s.archived);

  return (
    <section
      id={`list-${list.key}`}
      className={`bg-white border border-[#E8E9EE] rounded-2xl shadow-[0_1px_2px_rgba(16,24,40,0.04),0_2px_8px_-2px_rgba(16,24,40,0.06)] overflow-hidden ${
        list.archived ? 'opacity-60' : ''
      }`}
    >
      {/* List heading, over the categories it holds. The name edits in place. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 sm:px-6 py-4 border-b border-[#F0F1F4]">
        <span className="w-9 h-9 rounded-xl bg-[#17181D] text-white flex items-center justify-center shrink-0">
          <ClipboardList className="w-[18px] h-[18px]" />
        </span>
        <input
          aria-label="List name"
          value={list.label}
          disabled={list.archived}
          onChange={(e) => commit(renameList(doc, list.key, e.target.value))}
          onBlur={(e) => {
            const tidied = tidyName(e.target.value, UNTITLED_LIST);
            if (tidied !== list.label) commit(renameList(doc, list.key, tidied));
          }}
          className={`${quietField} flex-1 min-w-[10rem] px-2 py-1 -ml-1 text-[16px] font-bold tracking-tight text-[#17181D] disabled:line-through`}
        />
        <span className="rounded-full bg-[#F4F5F7] px-2.5 py-1 text-[11px] font-semibold text-[#6B6F76] tabular-nums shrink-0">
          {count} question{count === 1 ? '' : 's'}
        </span>
        {list.archived ? (
          <RestoreButton onClick={() => commit(restoreList(doc, list.key), 'List restored')} />
        ) : (
          <RowActions
            onUp={() => commit(moveList(doc, list.key, -1))}
            onDown={() => commit(moveList(doc, list.key, 1))}
            canUp={listIndex > 0}
            canDown={listIndex < doc.lists.length - 1}
            onRemove={async () => {
              const ok = await confirm({
                title: `Remove the list “${list.label}”?`,
                body: 'Everything in it goes with it.',
                confirmLabel: 'Remove list',
              });
              if (!ok) return;
              const { doc: next, archived } = removeList(doc, list.key, isAnswered);
              commit(next, removedNotice(archived, 'List'));
            }}
            removeTitle="Remove list"
            alwaysVisible
          />
        )}
      </div>

      <div className="divide-y divide-[#F0F1F4]">
        {visibleSections.map((section) => (
          <SectionCard
            key={section.key}
            doc={doc}
            list={list}
            section={section}
            sectionIndex={list.sections.indexOf(section)}
            showArchived={showArchived}
            isOpen={!!open[`${list.key}::${section.key}`]}
            toggle={() =>
              setOpen((o) => ({
                ...o,
                [`${list.key}::${section.key}`]: !o[`${list.key}::${section.key}`],
              }))
            }
            commit={commit}
            isAnswered={isAnswered}
            removedNotice={removedNotice}
          />
        ))}

        {!list.archived && (
          <InlineAdd
            label="Add a category"
            placeholder="e.g. Cold storage"
            subtle
            onAdd={(value) => commit(addSection(doc, list.key, value), 'Category added')}
          />
        )}
      </div>
    </section>
  );
};

// ---------------------------------------------------------------------------
// One category — a row, closed by default, showing its name and question count
// ---------------------------------------------------------------------------

interface SectionCardProps {
  doc: ChecklistDoc;
  list: ChecklistList;
  section: Section;
  sectionIndex: number;
  showArchived: boolean;
  isOpen: boolean;
  toggle: () => void;
  commit: (next: ChecklistDoc, message?: string) => void;
  isAnswered: (id: number) => boolean;
  removedNotice: (archived: boolean, what: string) => string;
}

const SectionCard: React.FC<SectionCardProps> = ({
  doc,
  list,
  section,
  sectionIndex,
  showArchived,
  isOpen,
  toggle,
  commit,
  isAnswered,
  removedNotice,
}) => {
  const confirm = useConfirm();
  const [adding, setAdding] = useState(false);
  const Icon = iconFor(section.title);
  const items = section.items.filter((i) => showArchived || !i.archived);
  const count = section.items.filter((i) => !i.archived).length;

  return (
    <div className={section.archived ? 'opacity-60' : undefined}>
      {/* Header. The chevron opens it, with the name editable in place. */}
      <div
        className={`group flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-1 px-4 sm:px-6 py-3 transition-colors ${
          isOpen ? 'bg-[#FAFBFC]' : 'hover:bg-[#FAFBFC]'
        }`}
      >
        <span
          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors ${
            isOpen ? 'bg-[#FDECEE] text-[#C8202D]' : 'bg-[#F4F5F7] text-[#17181D]'
          }`}
        >
          <Icon className="w-[18px] h-[18px]" />
        </span>

        <div className="flex-1 min-w-0">
          <input
            aria-label="Category name"
            value={section.title}
            disabled={section.archived}
            onChange={(e) => commit(renameSection(doc, list.key, section.key, e.target.value))}
            /*
              Tidied on the way out rather than as you type: this field writes
              into the document on every keystroke, so trimming here would eat
              the space the moment you pressed it.
            */
            onBlur={(e) => {
              const tidied = tidyName(e.target.value, UNTITLED_SECTION);
              if (tidied !== section.title) {
                commit(renameSection(doc, list.key, section.key, tidied));
              }
            }}
            className={`${quietField} w-full px-2 py-0.5 -ml-2 text-[14px] font-semibold text-[#17181D] disabled:line-through`}
          />
          <p className="px-2 -ml-2 text-xs text-[#6B6F76] tabular-nums">
            {count} question{count === 1 ? '' : 's'}
          </p>
        </div>

        {/*
          Below the name on a phone, where beside it they squeezed the name
          down to its first few letters; in line from sm up.
        */}
        <div className="order-last basis-full pl-[52px] -mt-1 sm:order-none sm:basis-auto sm:pl-0 sm:mt-0 flex">
        {section.archived ? (
          <RestoreButton
            onClick={() =>
              commit(restoreSection(doc, list.key, section.key), 'Category restored')
            }
          />
        ) : (
          <RowActions
            onUp={() => commit(moveSection(doc, list.key, section.key, -1))}
            onDown={() => commit(moveSection(doc, list.key, section.key, 1))}
            canUp={sectionIndex > 0}
            canDown={sectionIndex < list.sections.length - 1}
            onRemove={async () => {
              const ok = await confirm({
                title: `Remove the category “${section.title}”?`,
                body: 'Its questions are removed with it.',
                confirmLabel: 'Remove category',
              });
              if (!ok) return;
              const { doc: next, archived } = removeSection(doc, list.key, section.key, isAnswered);
              commit(next, removedNotice(archived, 'Category'));
            }}
            removeTitle="Remove category"
          />
        )}
        </div>

        <button
          type="button"
          onClick={toggle}
          aria-expanded={isOpen}
          aria-label={`${isOpen ? 'Collapse' : 'Expand'} ${section.title}`}
          className={`w-9 h-9 rounded-xl flex items-center justify-center border transition-all cursor-pointer shrink-0 ${
            isOpen
              ? 'bg-white border-[#E4E6EB] text-[#17181D] shadow-xs'
              : 'border-transparent text-[#6B6F76] hover:bg-white hover:border-[#E4E6EB] hover:text-[#17181D] hover:shadow-xs'
          }`}
        >
          <ChevronDown
            className={`w-[18px] h-[18px] transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/*
        Height only, never a slide: the questions open downward from the row
        that owns them, and close back into it.
      */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="questions"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: t(0.3), ease: EASE_OUT }}
            className="overflow-hidden bg-[#FAFBFC]"
          >
            <div className="px-3 sm:px-6 pb-4 pt-1">
              <div className="rounded-xl border border-[#E8E9EE] bg-white overflow-hidden">
                {items.length === 0 ? (
                  <p className="px-4 py-6 text-xs text-[#6B6F76] text-center">
                    No questions in this category yet.
                  </p>
                ) : (
                  <div className="divide-y divide-[#F0F1F4]">
                    {items.map((item) => (
                      <QuestionRow
                        key={item.id}
                        item={item}
                        duplicateCount={
                          findDuplicateText(doc, item.text, { listKey: list.key, itemId: item.id })
                            .length
                        }
                        hasHistory={isAnswered(globalId(list, item.id))}
                        canMoveUp={section.items.indexOf(item) > 0}
                        canMoveDown={section.items.indexOf(item) < section.items.length - 1}
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
                    ))}
                  </div>
                )}

                {!section.archived && (
                  <div className="px-3 sm:px-4 py-3 border-t border-[#F0F1F4] bg-[#FAFBFC]">
                    {adding ? (
                      <NewQuestionForm
                        doc={doc}
                        onCancel={() => setAdding(false)}
                        onAdd={(draft) => {
                          commit(
                            addItem(doc, list.key, section.key, {
                              text: draft.text.trim(),
                              reasonGroup: draft.reasonGroup,
                              severity: draft.severity,
                              // A row left completely blank is not a detail
                              details: draft.details.filter(
                                (d) => d.label.trim() || d.value.trim()
                              ),
                            }),
                            'Question added'
                          );
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        onClick={() => setAdding(true)}
                        className="inline-flex items-center gap-1.5 h-8 px-3 -ml-1 rounded-lg text-xs font-bold text-[#C8202D] hover:bg-[#FDECEE] transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Add a question
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// ---------------------------------------------------------------------------
// One question — a line of text until you point at it
// ---------------------------------------------------------------------------

interface QuestionRowProps {
  item: Item;
  duplicateCount: number;
  hasHistory: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  onChange: (patch: Partial<NewItem>) => void;
  onMove: (delta: number) => void;
  onRemove: () => void;
  onRestore: () => void;
}

const QuestionRow: React.FC<QuestionRowProps> = ({
  item,
  duplicateCount,
  hasHistory,
  canMoveUp,
  canMoveDown,
  onChange,
  onMove,
  onRemove,
  onRestore,
}) => {
  const confirm = useConfirm();
  const details = item.details ?? [];
  /* Open when there is something to see, so recorded kit is never hidden. */
  const [showDetails, setShowDetails] = useState(details.length > 0);

  return (
    <div className={item.archived ? 'bg-[#FAFBFC]' : ''}>
      <div
        className={`group px-3 sm:px-4 py-2.5 flex flex-col lg:flex-row lg:items-center gap-2 transition-colors ${
          item.archived ? '' : 'hover:bg-[#FAFBFC]'
        }`}
      >
    <div className="flex-1 min-w-0">
      <input
        aria-label="Question text"
        value={item.text}
        disabled={item.archived}
        onChange={(e) => onChange({ text: e.target.value })}
        onBlur={(e) => {
          const tidied = tidyName(e.target.value, UNTITLED_ITEM);
          if (tidied !== item.text) onChange({ text: tidied });
        }}
        className={`${quietField} w-full px-2 py-1.5 -ml-2 text-[13px] text-[#17181D] disabled:line-through disabled:text-[#6B6F76]`}
      />
      {item.archived && (
        <p className="px-2 -ml-2 mt-0.5 text-[10px] font-bold uppercase tracking-wider text-[#6B6F76]">
          Removed — still shown on past reports
        </p>
      )}
      {!item.archived && duplicateCount > 0 && (
        <p className="px-2 -ml-2 mt-0.5 text-[11px] text-[#B4740A] flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>This exact question is also asked elsewhere</span>
        </p>
      )}
    </div>

    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
      <select
        aria-label="Reason group"
        value={item.reasonGroup}
        disabled={item.archived}
        onChange={(e) => onChange({ reasonGroup: e.target.value as ReasonGroup })}
        title={`Reasons offered when this is marked No (${REASON_GROUPS[item.reasonGroup].length} options)`}
        className={`${quietField} w-[8.5rem] h-8 px-2 text-[11px] font-bold text-[#6B6F76] cursor-pointer`}
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
        className={`${quietField} w-[6rem] h-8 px-2 text-[11px] font-bold text-[#6B6F76] cursor-pointer`}
      >
        {SEVERITY_KEYS.map((s) => (
          <option key={s} value={s}>
            {SEVERITY_LABEL[s]}
          </option>
        ))}
      </select>

      <span className="hidden 2xl:inline-block w-[5.5rem]">
        <PriorityBadge severity={item.severity} size="sm" />
      </span>

      {/*
        Kit details. The count sits on the button so a question carrying a
        serial number says so without the panel having to be open.

        Always visible, on every screen size. It used to fade in on hover
        while a question had no kit recorded, which read as the control
        disappearing: open the panel, move the cursor away, and the button
        that opened it was gone while the panel below stayed put. A control
        that has to be hunted for is one nobody knows exists — which is how
        this ended up looking like a field only new questions had.
      */}
      {!item.archived && (
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          aria-expanded={showDetails}
          title="Details of the kit this question is about"
          className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-full text-[11px] font-bold transition-colors cursor-pointer shrink-0 ${
            details.length > 0
              ? 'text-[#C8202D] bg-[#FDECEE] hover:bg-[#FBDCDF]'
              : 'text-[#6B6F76] bg-[#F4F5F7] hover:bg-[#EBEDF0] hover:text-[#17181D]'
          }`}
        >
          <Tag className="w-3.5 h-3.5" />
          {details.length > 0 ? details.length : 'Details'}
        </button>
      )}

      {item.archived ? (
        <RestoreButton onClick={onRestore} />
      ) : (
        <RowActions
          onUp={() => onMove(-1)}
          onDown={() => onMove(1)}
          canUp={canMoveUp}
          canDown={canMoveDown}
          onRemove={async () => {
            const ok = await confirm({
              title: 'Remove this question?',
              body: hasHistory
                ? 'Past reports that already answered it will keep showing it.'
                : undefined,
              confirmLabel: 'Remove question',
            });
            if (ok) onRemove();
          }}
          removeTitle="Remove question"
        />
      )}
        </div>
      </div>

      {showDetails && !item.archived && (
        <div className="px-3 sm:px-4 pb-3.5 pt-0.5">
          <div className="rounded-xl border border-[#F0F1F4] bg-[#FAFBFC] p-3 space-y-2.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9CA1A9]">
              Kit this question is about
            </p>
            <DetailFields
              details={details}
              onChange={(next) => onChange({ details: next })}
            />
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

/**
 * Move and remove, held back until the row is hovered or something in it has
 * focus. Kept mounted rather than conditionally rendered so the row does not
 * change width under the pointer, and always shown on touch, where there is
 * no hover to reveal them with.
 */
const RowActions: React.FC<{
  onUp: () => void;
  onDown: () => void;
  canUp: boolean;
  canDown: boolean;
  onRemove: () => void;
  removeTitle: string;
  alwaysVisible?: boolean;
}> = ({ onUp, onDown, canUp, canDown, onRemove, removeTitle, alwaysVisible }) => (
  <div
    className={`flex items-center gap-0.5 shrink-0 transition-opacity ${
      alwaysVisible
        ? ''
        : 'lg:opacity-0 lg:group-hover:opacity-100 lg:group-focus-within:opacity-100'
    }`}
  >
    <button type="button" onClick={onUp} disabled={!canUp} className={iconBtnClass} title="Move up">
      <ChevronDown className="w-4 h-4 rotate-180" />
    </button>
    <button
      type="button"
      onClick={onDown}
      disabled={!canDown}
      className={iconBtnClass}
      title="Move down"
    >
      <ChevronDown className="w-4 h-4" />
    </button>
    <button
      type="button"
      onClick={onRemove}
      className="w-8 h-8 rounded-lg flex items-center justify-center text-[#9CA1A9] hover:bg-[#FDECEE] hover:text-[#C8202D] transition-colors cursor-pointer"
      title={removeTitle}
    >
      <Trash2 className="w-4 h-4" />
    </button>
  </div>
);

const RestoreButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex items-center gap-1.5 h-8 px-3 text-xs font-bold text-[#C8202D] bg-[#FDECEE] hover:bg-[#FBDCDF] rounded-lg transition-colors cursor-pointer shrink-0"
  >
    <Undo2 className="w-3.5 h-3.5" />
    <span>Restore</span>
  </button>
);

/** Text, group and priority for a question being added. */
const NewQuestionForm: React.FC<{
  doc: ChecklistDoc;
  onAdd: (draft: {
    text: string;
    reasonGroup: ReasonGroup;
    severity: Severity;
    details: ItemDetail[];
  }) => void;
  onCancel: () => void;
}> = ({ doc, onAdd, onCancel }) => {
  const [text, setText] = useState('');
  const [reasonGroup, setReasonGroup] = useState<ReasonGroup>('CLEANING');
  const [severity, setSeverity] = useState<Severity>('medium');
  const [details, setDetails] = useState<ItemDetail[]>([]);
  const dupes = findDuplicateText(doc, text);

  const submit = () => {
    if (!text.trim()) return;
    onAdd({ text, reasonGroup, severity, details });
    // Stay open with the settings kept, so a run of questions is quick to add.
    // Details are cleared: a serial number belongs to one unit, not the next.
    setText('');
    setDetails([]);
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          autoFocus
          aria-label="New question"
          placeholder="What should the inspector check?"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              submit();
            }
            if (e.key === 'Escape') onCancel();
          }}
          className={`${inputClass} flex-1`}
        />
        <select
          aria-label="Reason group for new question"
          value={reasonGroup}
          onChange={(e) => setReasonGroup(e.target.value as ReasonGroup)}
          className={`${inputClass} sm:w-40`}
        >
          {REASON_GROUP_KEYS.map((g) => (
            <option key={g} value={g}>
              {g}
            </option>
          ))}
        </select>
        <select
          aria-label="Priority for new question"
          value={severity}
          onChange={(e) => setSeverity(e.target.value as Severity)}
          className={`${inputClass} sm:w-32`}
        >
          {SEVERITY_KEYS.map((s) => (
            <option key={s} value={s}>
              {SEVERITY_LABEL[s]}
            </option>
          ))}
        </select>
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            disabled={!text.trim()}
            onClick={submit}
            className={addBtnClass}
          >
            <Check className="w-3.5 h-3.5" />
            <span>Add</span>
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="w-10 h-10 rounded-xl flex items-center justify-center text-[#6B6F76] hover:bg-white hover:text-[#17181D] hover:shadow-xs transition-all cursor-pointer"
            title="Done adding"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
      {dupes.length > 0 && (
        <p className="text-[11px] text-[#B4740A] flex items-start gap-1.5">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-px" />
          <span>
            Already asked in {dupes[0].listLabel} / {dupes[0].sectionTitle}
          </span>
        </p>
      )}

      {/*
        Kit details for the question being written. Only shown once there is a
        question to attach them to, so the form opens as a single line.
      */}
      {text.trim().length > 0 && (
        <div className="rounded-xl border border-[#F0F1F4] bg-white p-3 space-y-2.5">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-[#9CA1A9]">
            Kit this question is about — optional
          </p>
          <DetailFields details={details} onChange={setDetails} />
        </div>
      )}
    </div>
  );
};

/**
 * "Add a category" / "Add a list" as a button that becomes a field, rather
 * than a text box sitting open on the page whether or not anyone wants it.
 */
const InlineAdd: React.FC<{
  label: string;
  placeholder: string;
  subtle?: boolean;
  onAdd: (value: string) => void;
}> = ({ label, placeholder, subtle, onAdd }) => {
  const [openField, setOpenField] = useState(false);
  const [value, setValue] = useState('');

  const submit = () => {
    if (!value.trim()) return;
    onAdd(value.trim());
    setValue('');
    setOpenField(false);
  };

  /*
   * Two looks for the one control. Subtle is the last row of a list's card,
   * so it reads as part of that card; the other stands on the page on its own,
   * as a dashed outline of the card it would add.
   */
  if (!openField) {
    return (
      <button
        type="button"
        onClick={() => setOpenField(true)}
        className={`w-full flex items-center gap-2 text-xs font-bold transition-colors cursor-pointer ${
          subtle
            ? 'px-4 sm:px-6 py-3.5 text-[#6B6F76] hover:text-[#C8202D] hover:bg-[#FAFBFC]'
            : 'justify-center h-14 rounded-2xl border border-dashed border-[#D0D3D9] text-[#6B6F76] hover:border-[#C8202D]/50 hover:text-[#C8202D] hover:bg-white'
        }`}
      >
        <span
          className={`flex items-center justify-center rounded-lg ${
            subtle ? 'w-10 h-8' : 'w-7 h-7 bg-[#F4F5F7]'
          }`}
        >
          <Plus className="w-3.5 h-3.5" />
        </span>
        {label}
      </button>
    );
  }

  return (
    <div
      className={`flex flex-col sm:flex-row gap-2 ${
        subtle
          ? 'px-4 sm:px-6 py-3 bg-[#FAFBFC]'
          : 'bg-white border border-[#E8E9EE] rounded-2xl p-3 shadow-[0_1px_2px_rgba(16,24,40,0.04),0_2px_8px_-2px_rgba(16,24,40,0.06)]'
      }`}
    >
      <input
        autoFocus
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
          if (e.key === 'Escape') {
            setValue('');
            setOpenField(false);
          }
        }}
        className={`${inputClass} flex-1`}
      />
      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          disabled={!value.trim()}
          onClick={submit}
          className={addBtnClass}
        >
          <Check className="w-3.5 h-3.5" />
          <span>Add</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setValue('');
            setOpenField(false);
          }}
          className="w-10 h-10 rounded-xl flex items-center justify-center text-[#6B6F76] hover:bg-[#F4F5F7] hover:text-[#17181D] transition-colors cursor-pointer"
          title="Cancel"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
