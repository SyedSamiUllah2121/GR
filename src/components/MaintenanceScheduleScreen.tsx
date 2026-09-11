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
  MAINTENANCE_CATEGORY_KEYS,
  MAINTENANCE_CATEGORY_LABEL,
  MaintenanceCategory,
  MaintenancePlan,
  SEVERITY_KEYS,
  Severity,
} from '../types';
import { SEVERITY_LABEL } from '../services/priority';
import {
  INTERVAL_CHOICES,
  PlanDraft,
  addPlan,
  deletePlan,
  getPlans,
  setPlanActive,
  subscribeToPlans,
  updatePlan,
} from '../services/maintenancePlanStore';
import { getEquipment, subscribeToEquipment } from '../services/equipmentStore';
import { getJobs, subscribeToMaintenance } from '../services/maintenanceStore';
import { toIsoDay, upcomingServices } from '../services/maintenanceSchedule';
import { PriorityBadge } from './PriorityBadge';
import { useToast } from './ToastProvider';

const inputClass =
  'w-full px-3 py-2.5 bg-white border border-[#E6E7EB] rounded-md text-sm text-[#17181D] placeholder:text-[#6B6F76]/50 focus:outline-none focus:border-[#C8202D] focus:ring-1 focus:ring-[#C8202D]';

const labelClass =
  'block text-[10px] font-bold uppercase tracking-wider text-[#6B6F76] mb-1.5';

/** "every 3 months", "every year" — the way somebody would say it. */
export function intervalLabel(months: number): string {
  if (months === 1) return 'every month';
  if (months === 12) return 'every year';
  if (months === 24) return 'every 2 years';
  return `every ${months} months`;
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
 * The list underneath is the point of the screen: an interval is an abstract
 * promise until you can see it means eleven services next week.
 */
export const MaintenanceScheduleScreen: React.FC = () => {
  const showToast = useToast();
  const [plans, setPlans] = useState<MaintenancePlan[]>(() => getPlans());
  const [equipment, setEquipment] = useState(() => getEquipment());
  const [jobs, setJobs] = useState(() => getJobs());
  const [editing, setEditing] = useState<MaintenancePlan | 'new' | null>(null);

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
  useEffect(() => {
    const refresh = () => setJobs(getJobs());
    refresh();
    return subscribeToMaintenance(refresh);
  }, []);

  const today = toIsoDay(new Date());

  /** How many assets each plan actually covers. An interval on nothing is noise. */
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

  const overdue = upcoming.filter((u) => u.daysOverdue >= 0);
  const soon = upcoming.filter((u) => u.daysOverdue < 0).slice(0, 25);

  const byCategory = useMemo(() => {
    const map = new Map<MaintenanceCategory, MaintenancePlan[]>();
    plans.forEach((p) => {
      const list = map.get(p.category);
      if (list) list.push(p);
      else map.set(p.category, [p]);
    });
    return MAINTENANCE_CATEGORY_KEYS.filter((k) => map.has(k)).map((k) => ({
      category: k,
      plans: (map.get(k) ?? []).sort((a, b) => a.task.localeCompare(b.task)),
    }));
  }, [plans]);

  const remove = (plan: MaintenancePlan) => {
    const raised = jobs.some((j) => j.planId === plan.id);
    if (raised) {
      showToast('That plan has already raised work — turn it off instead');
      return;
    }
    if (!window.confirm(`Delete “${plan.task}” for ${MAINTENANCE_CATEGORY_LABEL[plan.category]}?`)) {
      return;
    }
    const result = deletePlan(plan.id);
    showToast(result.ok ? 'Plan deleted' : result.error ?? 'Could not delete that plan');
  };

  return (
    <div className="flex-1 flex flex-col min-w-0">
      <header className="min-h-[5rem] bg-white border-b border-[#E6E7EB] flex flex-col sm:flex-row sm:items-center justify-between px-6 md:px-10 shrink-0 gap-4 py-4 sm:py-0">
        <div>
          <h2 className="text-xl font-bold text-[#17181D]">Schedule</h2>
          <p className="text-[#6B6F76] text-xs mt-0.5">
            {plans.filter((p) => p.active).length} plan
            {plans.filter((p) => p.active).length === 1 ? '' : 's'} running
            {overdue.length > 0 && (
              <span className="text-[#C8202D] font-semibold"> • {overdue.length} due now</span>
            )}
          </p>
        </div>

        <button
          id="add-plan-btn"
          type="button"
          onClick={() => setEditing('new')}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#C8202D] hover:bg-[#A81823] text-white text-xs font-semibold rounded-md transition-colors shadow-xs cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Add a plan</span>
        </button>
      </header>

      <div className="p-6 md:p-10 flex-1 space-y-6">
        <div className="bg-white border border-[#E6E7EB] rounded-lg px-5 py-3.5 flex items-start gap-3">
          <CalendarClock className="w-4 h-4 text-[#6B6F76] shrink-0 mt-0.5" />
          <p className="text-xs text-[#6B6F76] leading-relaxed">
            A plan applies to every asset in the{' '}
            <Link href="/maintenance/equipment" className="font-semibold text-[#C8202D] hover:underline">
              register
            </Link>{' '}
            under its category. When one falls due, the job appears on the board by itself,
            dated the day it was due rather than the day anybody noticed. An individual
            asset that needs a different interval carries an override on its own record.
          </p>
        </div>

        {/* The plans themselves, grouped by the trade they belong to */}
        <div className="space-y-4">
          {byCategory.map(({ category, plans: list }) => (
            <section
              key={category}
              className="bg-white border border-[#E6E7EB] rounded-lg shadow-xs overflow-hidden"
            >
              <div className="px-5 py-3 border-b border-[#E6E7EB] flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-[#17181D]">
                  {MAINTENANCE_CATEGORY_LABEL[category]}
                </h3>
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
                        {!plan.active && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#F1F1F4] text-[#6B6F76]">
                            Off
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-[#6B6F76] mt-0.5">
                        {intervalLabel(plan.everyMonths)}
                        {plan.instructions ? ` • ${plan.instructions}` : ''}
                      </p>
                    </div>

                    <PriorityBadge severity={plan.priority} size="sm" />

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => setEditing(plan)}
                        aria-label={`Edit ${plan.task}`}
                        className="p-2 text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F1F1F4] rounded-md transition-colors cursor-pointer"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setPlanActive(plan.id, !plan.active);
                          showToast(plan.active ? `${plan.task} turned off` : `${plan.task} turned on`);
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
                      <button
                        type="button"
                        onClick={() => remove(plan)}
                        aria-label={`Delete ${plan.task}`}
                        className="p-2 text-[#C8202D] hover:bg-[#FDECEE] rounded-md transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>

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
      </div>

      {editing && (
        <PlanDialog
          plan={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(task) => {
            setEditing(null);
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
  const [draft, setDraft] = useState<PlanDraft>(() => ({
    category: plan?.category ?? 'IT_EQUIPMENT',
    task: plan?.task ?? '',
    everyMonths: plan?.everyMonths ?? 3,
    priority: plan?.priority ?? 'medium',
    instructions: plan?.instructions ?? '',
  }));
  const [error, setError] = useState<string | null>(null);

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
                className={inputClass}
              >
                {MAINTENANCE_CATEGORY_KEYS.map((key) => (
                  <option key={key} value={key}>
                    {MAINTENANCE_CATEGORY_LABEL[key]}
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
                autoFocus
                placeholder="e.g. Service, Toner refill"
                className={inputClass}
              />
            </div>
          </div>

          <div>
            <label htmlFor="plan-interval" className={labelClass}>
              How often
            </label>
            <select
              id="plan-interval"
              value={draft.everyMonths}
              onChange={(e) => set('everyMonths', Number(e.target.value))}
              className={inputClass}
            >
              {INTERVAL_CHOICES.map((months) => (
                <option key={months} value={months}>
                  {intervalLabel(months).replace(/^every /, 'Every ')}
                </option>
              ))}
            </select>
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
