'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Pencil,
  Plus,
  Power,
  Trash2,
} from 'lucide-react';
import {
  EquipmentCategory,
  Interval,
  IntervalUnit,
  MaintenanceCategory,
  MaintenanceJob,
  MaintenancePlan,
  SEVERITY_KEYS,
  Severity,
} from '../types';
import { SEVERITY_LABEL } from '../services/priority';
import {
  DAY_INTERVAL_CHOICES,
  INTERVAL_CHOICES,
  PlanDraft,
  addPlan,
  deletePlan,
  getPlans,
  isGeneralPlan,
  setPlanActive,
  subscribeToPlans,
  updatePlan,
} from '../services/maintenancePlanStore';
import { getEquipment, subscribeToEquipment } from '../services/equipmentStore';
import {
  UpcomingService,
  intervalOf,
  intervalText,
  toIsoDay,
  upcomingServices,
} from '../services/maintenanceSchedule';
import { activeCategories, categoryLabel, defaultCategory } from '../services/categoryStore';
import { useCategories } from '../hooks/useCategories';
import { PriorityBadge } from './PriorityBadge';
import { useToast } from './ToastProvider';

const inputClass =
  'w-full px-3 py-2.5 bg-white border border-[#E6E7EB] rounded-md text-sm text-[#17181D] placeholder:text-[#6B6F76]/50 focus:outline-none focus:border-[#C8202D] focus:ring-1 focus:ring-[#C8202D]';

const labelClass =
  'block text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-1.5';

/** Which plan the editor is open on, if it is open at all. */
export type PlanBeingEdited = MaintenancePlan | 'new' | null;

/** Everything the schedule shows, worked out once. */
export interface ScheduleBoard {
  plans: MaintenancePlan[];
  categories: EquipmentCategory[];
  /** Plans actually raising work — the number worth quoting. */
  activeCount: number;
  /** How many assets each plan covers. An interval on nothing is noise. */
  coverage: Map<MaintenanceCategory, number>;
  byCategory: { category: MaintenanceCategory; label: string; plans: MaintenancePlan[] }[];
  upcoming: UpcomingService[];
  overdue: UpcomingService[];
  /** The nearest of what has not fallen due yet — the whole tail is not a list. */
  soon: UpcomingService[];
}

/**
 * The servicing schedule, worked out from the plans and the register.
 *
 * Takes the jobs rather than subscribing to them itself: the board this sits
 * on is already holding that list, and two subscriptions to one store is two
 * chances for the two of them to disagree about what is on the board.
 */
export function useMaintenanceSchedule(jobs: MaintenanceJob[]): ScheduleBoard {
  const [plans, setPlans] = useState<MaintenancePlan[]>(() => getPlans());
  const [equipment, setEquipment] = useState(() => getEquipment());
  const categories = useCategories();

  useEffect(() => {
    const refresh = () => setPlans(getPlans());
    refresh();
    return subscribeToPlans(refresh);
  }, []);
  useEffect(() => {
    const refresh = () => setEquipment(getEquipment());
    refresh();
    return subscribeToEquipment(refresh);
  }, []);

  const today = toIsoDay(new Date());

  const coverage = useMemo(() => {
    const counts = new Map<MaintenanceCategory, number>();
    equipment
      .filter((e) => e.active)
      .forEach((e) => counts.set(e.category, (counts.get(e.category) ?? 0) + 1));
    return counts;
  }, [equipment]);

  const upcoming = useMemo(
    () => upcomingServices(today, plans.filter((p) => p.active), equipment, jobs),
    [today, plans, equipment, jobs]
  );

  /**
   * The plans, grouped under the trade they belong to.
   *
   * Ordered by the live category list and then joined by whatever categories
   * the plans themselves name and the list does not. That second half is the
   * important one: this used to intersect against a hardcoded array, so a plan
   * on any other category vanished from this screen with no error and no empty
   * state — it simply was not there. A rule the operator wrote and cannot see
   * is worse than one they can see is wrong, so an orphan is appended and
   * labelled by its raw id rather than dropped.
   */
  const byCategory = useMemo(() => {
    const map = new Map<MaintenanceCategory, MaintenancePlan[]>();
    plans.forEach((p) => {
      const list = map.get(p.category);
      if (list) list.push(p);
      else map.set(p.category, [p]);
    });

    const ordered = categories.filter((c) => map.has(c.id)).map((c) => c.id);
    const known = new Set(ordered);
    const orphans = Array.from(map.keys()).filter((k) => !known.has(k));

    return [...ordered, ...orphans].map((key) => ({
      category: key,
      label: categoryLabel(key, categories),
      plans: (map.get(key) ?? []).sort((a, b) => {
        // General maintenance first in its section — it is the rule the rest
        // of the category's named tasks are exceptions to
        const aGeneral = isGeneralPlan(a);
        const bGeneral = isGeneralPlan(b);
        if (aGeneral !== bGeneral) return aGeneral ? -1 : 1;
        return a.task.localeCompare(b.task);
      }),
    }));
  }, [plans, categories]);

  const overdue = useMemo(() => upcoming.filter((u) => u.daysOverdue >= 0), [upcoming]);
  const soon = useMemo(
    () => upcoming.filter((u) => u.daysOverdue < 0).slice(0, 25),
    [upcoming]
  );

  return {
    plans,
    categories,
    activeCount: plans.filter((p) => p.active).length,
    coverage,
    byCategory,
    upcoming,
    overdue,
    soon,
  };
}

/**
 * The servicing schedule: what each category is serviced on, and what that
 * means is coming.
 *
 * Written per category rather than per asset because that is how the decision
 * is actually made — nobody sets an interval for each of forty air
 * conditioners, they decide what air conditioning needs. Every asset in the
 * register under that category then follows it, and the arithmetic falls out.
 *
 * The list underneath is the point of it: an interval is an abstract promise
 * until you can see it means eleven services next week.
 *
 * A panel rather than a screen of its own, because it is a tab on the job
 * board — the schedule is what puts half that board there, so it is read
 * alongside it rather than found somewhere else. The board owns the heading
 * and the "Add a plan" button, a tabbed screen having one primary action and
 * it belonging to whichever tab is open, so the editor those open is held
 * there and handed back down here.
 */
export const MaintenanceSchedulePanel: React.FC<{
  schedule: ScheduleBoard;
  jobs: MaintenanceJob[];
  editing: PlanBeingEdited;
  onEditing: (plan: PlanBeingEdited) => void;
}> = ({ schedule, jobs, editing, onEditing }) => {
  const showToast = useToast();
  const { coverage, byCategory, upcoming, overdue, soon } = schedule;

  const remove = (plan: MaintenancePlan) => {
    const raised = jobs.some((j) => j.planId === plan.id);
    if (raised) {
      showToast('That plan has already raised work — turn it off instead');
      return;
    }
    if (!window.confirm(`Delete “${plan.task}” for ${categoryLabel(plan.category)}?`)) {
      return;
    }
    const result = deletePlan(plan.id);
    showToast(result.ok ? 'Plan deleted' : result.error ?? 'Could not delete that plan');
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-[#E6E7EB] rounded-lg px-5 py-3.5 flex items-start gap-3">
        <CalendarClock className="w-4 h-4 text-[#6B6F76] shrink-0 mt-0.5" />
        <p className="text-xs text-[#6B6F76] leading-relaxed">
          A plan applies to every asset in the{' '}
          <Link
            href="/maintenance/equipment"
            className="font-semibold text-[#C8202D] hover:underline"
          >
            register
          </Link>{' '}
          under its category. When one falls due, the job appears on the board by itself,
          dated the day it was due rather than the day anybody noticed. An individual
          asset that needs a different interval carries an override on its own record.
        </p>
      </div>

      {/* The plans themselves, grouped by the trade they belong to */}
      {byCategory.length === 0 ? (
        <div className="bg-white border border-[#E6E7EB] rounded-lg p-10 text-center shadow-xs">
          <CalendarClock className="w-8 h-8 text-[#9CA1A9] mx-auto mb-2.5" />
          <p className="text-sm font-bold text-[#17181D]">No plans yet</p>
          <p className="text-xs text-[#6B6F76] mt-1">
            Add one and servicing raises itself on this board as it falls due.
          </p>
          <button
            type="button"
            onClick={() => onEditing('new')}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md transition-colors shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add a plan</span>
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {byCategory.map(({ category, label, plans: list }) => (
            <section
              key={category}
              className="bg-white border border-[#E6E7EB] rounded-lg shadow-xs overflow-hidden"
            >
              <div className="px-5 py-3 border-b border-[#E6E7EB] flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[#17181D]">{label}</h3>
                <span className="text-[11px] text-[#6B6F76]">
                  {coverage.get(category) ?? 0} asset
                  {(coverage.get(category) ?? 0) === 1 ? '' : 's'} in the register
                </span>
              </div>

              <ul className="divide-y divide-[#EFEFF2]">
                {list.map((plan) => (
                  <li
                    key={plan.id}
                    className={`px-5 py-3.5 flex flex-wrap items-center gap-x-4 gap-y-2 ${
                      plan.active ? '' : 'bg-[#FAFAFA]'
                    }`}
                  >
                    <div className="flex-1 min-w-[12rem]">
                      <p className="text-sm font-semibold text-[#17181D] flex flex-wrap items-center gap-2">
                        {plan.task}
                        {isGeneralPlan(plan) && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#FDECEE] text-[#C8202D]">
                            Every asset
                          </span>
                        )}
                        {!plan.active && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#F1F1F4] text-[#6B6F76]">
                            Off
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-[#6B6F76] mt-0.5">
                        {intervalText(intervalOf(plan))}
                        {plan.instructions ? ` • ${plan.instructions}` : ''}
                      </p>
                    </div>

                    <PriorityBadge severity={plan.priority} size="sm" />

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => onEditing(plan)}
                        aria-label={`Edit ${plan.task}`}
                        className="p-2 text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F1F1F4] rounded-md transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPlanActive(plan.id, !plan.active);
                          showToast(
                            plan.active ? `${plan.task} turned off` : `${plan.task} turned on`
                          );
                        }}
                        aria-label={plan.active ? `Turn off ${plan.task}` : `Turn on ${plan.task}`}
                        title={plan.active ? 'Stop raising this' : 'Start raising this again'}
                        className={`p-2 rounded-md transition-colors cursor-pointer ${
                          plan.active
                            ? 'text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F1F1F4]'
                            : 'text-[#157F4B] hover:bg-[#E6F4EC]'
                        }`}
                      >
                        <Power className="w-3.5 h-3.5" />
                      </button>
                      {/*
                        No delete on a general plan. It belongs to the category
                        rather than to this list, and the next load would write
                        it straight back — turning it off is the thing somebody
                        reaching for the bin actually wants.
                      */}
                      {!isGeneralPlan(plan) && (
                        <button
                          type="button"
                          onClick={() => remove(plan)}
                          aria-label={`Delete ${plan.task}`}
                          className="p-2 text-[#C8202D] hover:bg-[#FDECEE] rounded-md transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* What those intervals actually mean, in dates */}
      <section className="bg-white border border-[#E6E7EB] rounded-lg shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[#E6E7EB]">
          <h3 className="text-sm font-bold text-[#17181D]">What is coming</h3>
          <p className="text-xs text-[#6B6F76] mt-0.5">
            Every asset and plan together, soonest first.
          </p>
        </div>

        {upcoming.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle2 className="w-7 h-7 text-[#157F4B] mx-auto mb-2" />
            <p className="text-sm font-bold text-[#17181D]">Nothing scheduled</p>
            <p className="text-xs text-[#6B6F76] mt-1">
              No asset in the register falls under a plan that is running.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-[#EFEFF2] max-h-[28rem] overflow-y-auto">
            {[...overdue, ...soon].map((service) => (
              <li
                key={`${service.plan.id}::${service.equipment.id}`}
                className="px-5 py-3 flex flex-wrap items-center gap-x-4 gap-y-1.5"
              >
                <span className="flex-1 min-w-[14rem]">
                  <span className="block text-xs font-semibold text-[#17181D]">
                    {service.plan.task} — {service.equipment.name}
                  </span>
                  <span className="block text-[11px] text-[#6B6F76] mt-0.5">
                    {service.equipment.branchName}
                    {service.equipment.location ? ` • ${service.equipment.location}` : ''}
                  </span>
                </span>

                {service.job ? (
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#B4740A]">
                    <AlertTriangle className="w-3 h-3" />
                    On the board
                  </span>
                ) : null}

                <span
                  className={`text-[11px] font-semibold tabular-nums ${
                    service.daysOverdue >= 0 ? 'text-[#C8202D]' : 'text-[#6B6F76]'
                  }`}
                >
                  {service.daysOverdue >= 0
                    ? `due ${service.dueOn}`
                    : `${service.dueOn} — in ${Math.abs(service.daysOverdue)} day${
                        Math.abs(service.daysOverdue) === 1 ? '' : 's'
                      }`}
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-[#9CA1A9] shrink-0" />
              </li>
            ))}
          </ul>
        )}
      </section>

      {editing && (
        <PlanDialog
          plan={editing === 'new' ? null : editing}
          onClose={() => onEditing(null)}
          onSaved={(task) => {
            onEditing(null);
            showToast(`${task} saved`);
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// One plan
// ---------------------------------------------------------------------------

const PlanDialog: React.FC<{
  plan: MaintenancePlan | null;
  onClose: () => void;
  onSaved: (task: string) => void;
}> = ({ plan, onClose, onSaved }) => {
  const categories = useCategories();
  const [draft, setDraft] = useState<PlanDraft>(() => ({
    // The first trade on offer, never a named one: a chain with no printers
    // withdraws "IT & printers", and defaulting to it files a new rule about
    // ovens under printers
    category: plan?.category ?? defaultCategory(),
    task: plan?.task ?? '',
    interval: plan ? intervalOf(plan) : { every: 3, unit: 'months' },
    priority: plan?.priority ?? 'medium',
    instructions: plan?.instructions ?? '',
  }));
  const [error, setError] = useState<string | null>(null);

  /* A category's general maintenance is edited here, but its name and the
   * trade it belongs to are not: both are derived into its id, which every
   * job it has raised already carries. The cadence is what anybody means. */
  const general = plan ? isGeneralPlan(plan) : false;
  const choices = draft.interval.unit === 'days' ? DAY_INTERVAL_CHOICES : INTERVAL_CHOICES;

  const set = <K extends keyof PlanDraft>(key: K, value: PlanDraft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = plan
      ? updatePlan(plan.id, draft)
      : addPlan(draft, new Date().toISOString());
    if (!result.ok) {
      setError(result.error ?? 'Could not save that plan');
      return;
    }
    onSaved(result.plan?.task ?? draft.task);
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#17181D]/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white border border-[#E6E7EB] rounded-lg shadow-lg w-full max-w-lg my-8">
        <div className="px-6 py-4 border-b border-[#E6E7EB]">
          <h3 className="text-base font-bold text-[#17181D]">
            {plan ? 'Edit plan' : 'Add a plan'}
          </h3>
          <p className="text-xs text-[#6B6F76] mt-0.5">
            Applies to every asset in the register under this category.
          </p>
        </div>

        <form onSubmit={submit} className="p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="plan-category" className={labelClass}>
                Category
              </label>
              <select
                id="plan-category"
                value={draft.category}
                onChange={(e) => set('category', e.target.value as MaintenanceCategory)}
                disabled={general}
                title={general ? 'General maintenance belongs to its category' : undefined}
                className={`${inputClass} disabled:bg-[#F6F6F8] disabled:text-[#6B6F76]`}
              >
                {activeCategories(categories).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="plan-task" className={labelClass}>
                What recurs
              </label>
              <input
                id="plan-task"
                type="text"
                value={draft.task}
                onChange={(e) => set('task', e.target.value)}
                autoFocus={!general}
                disabled={general}
                placeholder="e.g. Service, Toner refill"
                className={`${inputClass} disabled:bg-[#F6F6F8] disabled:text-[#6B6F76]`}
              />
            </div>
          </div>

          {/*
            A number and a unit rather than a list of months, because a
            fortnightly filter rinse and a five-yearly gas certificate are both
            real and neither reads sensibly in the other's unit. The number is
            typed, and the list beside it is only the common answers.
          */}
          <div>
            <span className={labelClass}>How often</span>
            <div className="grid grid-cols-1 sm:grid-cols-[auto_1fr_1fr] gap-3 items-center">
              <span className="text-xs text-[#6B6F76]">Every</span>
              <input
                id="plan-interval"
                type="number"
                min={1}
                step={1}
                list="plan-interval-choices"
                value={draft.interval.every}
                onChange={(e) =>
                  set('interval', { ...draft.interval, every: Number(e.target.value) })
                }
                aria-label="How many"
                className={inputClass}
              />
              <datalist id="plan-interval-choices">
                {choices.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
              <select
                value={draft.interval.unit}
                onChange={(e) =>
                  set('interval', { ...draft.interval, unit: e.target.value as IntervalUnit })
                }
                aria-label="Days or months"
                className={inputClass}
              >
                <option value="days">days</option>
                <option value="months">months</option>
              </select>
            </div>
            <p className="mt-1.5 text-[11px] text-[#6B6F76]">
              Falls due {intervalText(draft.interval)}, counted from the last time the work
              was recorded as done.
            </p>
          </div>

          <div>
            <span className={labelClass}>How urgent the job should be</span>
            <div className="flex flex-wrap gap-1.5">
              {[...SEVERITY_KEYS].reverse().map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => set('priority', s as Severity)}
                  aria-pressed={draft.priority === s}
                  className={`px-3 py-2 rounded-md border text-[11px] font-bold transition-colors cursor-pointer ${
                    draft.priority === s
                      ? 'border-[#C8202D] bg-[#FDECEE] text-[#C8202D]'
                      : 'border-[#E6E7EB] bg-white text-[#6B6F76] hover:bg-[#F6F6F8]'
                  }`}
                >
                  {SEVERITY_LABEL[s]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label htmlFor="plan-instructions" className={labelClass}>
              What the work involves
            </label>
            <textarea
              id="plan-instructions"
              value={draft.instructions ?? ''}
              onChange={(e) => set('instructions', e.target.value)}
              rows={2}
              placeholder="Copied onto every job this plan raises."
              className={`${inputClass} resize-y`}
            />
          </div>

          {error && (
            <p className="text-xs font-semibold text-[#C8202D] bg-[#FDECEE] border border-[#C8202D]/30 rounded-md px-3 py-2.5">
              {error}
            </p>
          )}

          <div className="pt-3 border-t border-[#E6E7EB] flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-[#E6E7EB] rounded-md text-xs font-semibold text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F6F6F8] transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              id="plan-save-btn"
              type="submit"
              className="px-5 py-2.5 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md transition-colors cursor-pointer"
            >
              Save plan
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
