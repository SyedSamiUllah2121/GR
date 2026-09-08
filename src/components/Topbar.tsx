'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Bell,
  CalendarClock,
  ChevronDown,
  ClipboardList,
  LogOut,
  MapPin,
  PenLine,
  Search,
  Wrench,
  X,
} from 'lucide-react';
import { Inspection, MaintenanceJob } from '../types';
import { getInspections, setAuthenticated, subscribeToStorage } from '../services/storage';
import { getJobs, subscribeToMaintenance } from '../services/maintenanceStore';
import { formatDate } from '../services/reportModel';
import { CURRENT_USER } from '../data/user';
import { useBranches } from '../hooks/useBranches';
import { activeBranches } from '../services/branchStore';

/**
 * The bar above every screen: find a record, see what is outstanding, sign out.
 *
 * Everything in it reads the same stores the screens do, so the alert count
 * cannot disagree with what the dashboard says needs doing.
 */

const MAX_RESULTS = 6;

interface SearchHit {
  key: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  meta: string;
  group: string;
}

interface Alert {
  key: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  tone: 'bad' | 'warn';
}

/** Today as a plain local ISO date, matching how records store their dates. */
function todayIso(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ].join('-');
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00Z`).getTime();
  const b = new Date(`${to}T00:00:00Z`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

export const Topbar: React.FC = () => {
  const router = useRouter();
  const [inspections, setInspections] = useState<Inspection[]>(() => getInspections());
  const [jobs, setJobs] = useState<MaintenanceJob[]>(() => getJobs());
  // Closed branches are not chased for being overdue
  const branches = activeBranches(useBranches());

  useEffect(() => {
    const refresh = () => setInspections(getInspections());
    refresh();
    return subscribeToStorage(refresh);
  }, []);

  useEffect(() => {
    const refresh = () => setJobs(getJobs());
    refresh();
    return subscribeToMaintenance(refresh);
  }, []);

  // Which panel, if any, is showing. Only one may be open at a time.
  const [open, setOpen] = useState<'search' | 'alerts' | 'user' | null>(null);
  const [query, setQuery] = useState('');
  const barRef = useRef<HTMLDivElement>(null);

  // Clicking away or pressing Escape closes whatever is open
  useEffect(() => {
    if (open === null) return;
    const onDown = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) setOpen(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const hits = useMemo<SearchHit[]>(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];

    const submitted = inspections.filter((i) => i.status === 'submitted');
    const out: SearchHit[] = [];

    // A branch resolves to its most recent visit, so the hit lands on a record
    branches.filter(
      (b) => b.name.toLowerCase().includes(q) || b.location.toLowerCase().includes(q)
    ).forEach((b) => {
      const latest = submitted
        .filter((i) => i.branchName === b.name)
        .sort((x, y) => y.date.localeCompare(x.date))[0];
      out.push({
        key: `branch-${b.id}`,
        href: latest ? `/inspections/${latest.id}` : '/inspections/new',
        icon: MapPin,
        title: b.name,
        meta: latest ? `Latest visit ${formatDate(latest.date)}` : 'Never inspected',
        group: 'Branches',
      });
    });

    inspections
      .filter(
        (i) =>
          i.branchName.toLowerCase().includes(q) ||
          (i.inspectorName ?? '').toLowerCase().includes(q) ||
          i.id.toLowerCase().includes(q)
      )
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, MAX_RESULTS)
      .forEach((i) => {
        out.push({
          key: `insp-${i.id}`,
          href:
            i.status === 'draft' ? `/inspections/${i.id}/checklist` : `/inspections/${i.id}`,
          icon: ClipboardList,
          title: i.branchName,
          meta: `${formatDate(i.date)} • ${
            i.status === 'draft' ? 'Draft' : `${i.score}%`
          }${i.inspectorName ? ` • ${i.inspectorName}` : ''}`,
          group: 'Inspections',
        });
      });

    jobs
      .filter(
        (j) =>
          j.title.toLowerCase().includes(q) ||
          j.branchName.toLowerCase().includes(q) ||
          j.equipment.toLowerCase().includes(q)
      )
      .slice(0, MAX_RESULTS)
      .forEach((j) => {
        out.push({
          key: `job-${j.id}`,
          href: `/maintenance/${j.id}`,
          icon: Wrench,
          title: j.title,
          meta: `${j.branchName} • ${j.equipment}`,
          group: 'Maintenance',
        });
      });

    return out.slice(0, 12);
  }, [query, inspections, jobs, branches]);

  const alerts = useMemo<Alert[]>(() => {
    const today = todayIso();
    const submitted = inspections.filter((i) => i.status === 'submitted');
    const out: Alert[] = [];

    const draft = inspections.find((i) => i.status === 'draft');
    if (draft) {
      out.push({
        key: 'draft',
        href: `/inspections/${draft.id}/checklist`,
        icon: PenLine,
        text: `Unfinished inspection at ${draft.branchName}`,
        tone: 'warn',
      });
    }

    branches.forEach((b) => {
      const latest = submitted
        .filter((i) => i.branchName === b.name)
        .sort((x, y) => y.date.localeCompare(x.date))[0];
      if (!latest) {
        out.push({
          key: `never-${b.id}`,
          href: '/inspections/new',
          icon: CalendarClock,
          text: `${b.name} has never been inspected`,
          tone: 'bad',
        });
        return;
      }
      // Same weekly cadence the reports use
      const due = new Date(`${latest.date}T00:00:00Z`);
      due.setUTCDate(due.getUTCDate() + 7);
      const dueIso = due.toISOString().slice(0, 10);
      const over = daysBetween(dueIso, today);
      if (over > 0) {
        out.push({
          key: `overdue-${b.id}`,
          href: '/inspections/new',
          icon: CalendarClock,
          text: `${b.name} is ${over} day${over === 1 ? '' : 's'} overdue`,
          tone: 'bad',
        });
      }
    });

    const openJobs = jobs.filter((j) => j.completedAt === null);
    const urgent = openJobs.filter((j) => j.priority === 'critical' || j.priority === 'high');
    if (openJobs.length > 0) {
      out.push({
        key: 'jobs',
        href: '/maintenance/jobs',
        icon: Wrench,
        text: `${openJobs.length} maintenance job${
          openJobs.length === 1 ? '' : 's'
        } outstanding${urgent.length > 0 ? ` — ${urgent.length} urgent` : ''}`,
        tone: urgent.length > 0 ? 'bad' : 'warn',
      });
    }

    const unsigned = submitted.filter((i) => !i.signature).length;
    if (unsigned > 0) {
      out.push({
        key: 'unsigned',
        href: '/inspections',
        icon: PenLine,
        text: `${unsigned} submitted record${
          unsigned === 1 ? '' : 's'
        } with no manager signature`,
        tone: 'warn',
      });
    }

    return out;
  }, [inspections, jobs, branches]);

  const go = (href: string) => {
    setOpen(null);
    setQuery('');
    router.push(href);
  };

  const handleSignOut = () => {
    setAuthenticated(false);
    router.replace('/login');
  };

  return (
    <div
      ref={barRef}
      className="no-print sticky top-0 z-20 h-16 bg-white border-b border-[#E6E7EB] flex items-center gap-3 sm:gap-5 px-4 sm:px-6 md:px-8 shrink-0"
    >
      {/* Search */}
      <div className="relative flex-1 max-w-2xl">
        <Search className="w-4 h-4 text-[#9CA1A9] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          id="global-search"
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen('search');
          }}
          onFocus={() => setOpen('search')}
          placeholder="Search branches, inspections, or jobs…"
          aria-label="Search branches, inspections and maintenance jobs"
          className="w-full h-10 pl-10 pr-9 rounded-full bg-[#F6F6F8] border border-[#E6E7EB] text-sm text-[#17181D] placeholder:text-[#9CA1A9] focus:outline-none focus:bg-white focus:border-[#C8202D]/40 transition-colors"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9CA1A9] hover:text-[#17181D] cursor-pointer"
            aria-label="Clear search"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}

        {open === 'search' && query.trim().length >= 2 && (
          <Panel className="left-0 right-0">
            {hits.length === 0 ? (
              <p className="px-4 py-6 text-xs text-[#6B6F76] text-center">
                Nothing matches “{query.trim()}”.
              </p>
            ) : (
              <ul className="py-1.5 max-h-[22rem] overflow-y-auto">
                {hits.map((hit, i) => {
                  const newGroup = i === 0 || hits[i - 1].group !== hit.group;
                  return (
                    <li key={hit.key}>
                      {newGroup && (
                        <p className="px-4 pt-2.5 pb-1 text-[9px] font-bold uppercase tracking-[0.14em] text-[#9CA1A9]">
                          {hit.group}
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => go(hit.href)}
                        className="w-full px-4 py-2 flex items-center gap-3 text-left hover:bg-[#FAFAFA] transition-colors cursor-pointer"
                      >
                        <hit.icon className="w-4 h-4 text-[#6B6F76] shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-xs font-semibold text-[#17181D] truncate">
                            {hit.title}
                          </span>
                          <span className="block text-[11px] text-[#6B6F76] truncate">
                            {hit.meta}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        )}
      </div>

      <div className="flex items-center gap-1 sm:gap-2 ml-auto">
        {/* Alerts */}
        <div className="relative">
          <button
            type="button"
            id="topbar-alerts-btn"
            onClick={() => setOpen(open === 'alerts' ? null : 'alerts')}
            aria-expanded={open === 'alerts'}
            aria-label={`Alerts${alerts.length > 0 ? ` — ${alerts.length} outstanding` : ''}`}
            className="relative w-10 h-10 rounded-full flex items-center justify-center text-[#6B6F76] hover:text-[#17181D] hover:bg-[#F6F6F8] transition-colors cursor-pointer"
          >
            <Bell className="w-[18px] h-[18px]" />
            {alerts.length > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-[#C8202D] text-white text-[9px] font-bold flex items-center justify-center tabular-nums">
                {alerts.length > 9 ? '9+' : alerts.length}
              </span>
            )}
          </button>

          {open === 'alerts' && (
            <Panel className="right-0 w-[20rem] sm:w-[23rem]">
              <p className="px-4 py-2.5 border-b border-[#EFEFF2] text-[11px] font-bold uppercase tracking-wider text-[#6B6F76]">
                Needs attention
              </p>
              {alerts.length === 0 ? (
                <p className="px-4 py-6 text-xs text-[#6B6F76] text-center">
                  Nothing outstanding. Every branch is within schedule.
                </p>
              ) : (
                <ul className="py-1 max-h-[22rem] overflow-y-auto">
                  {alerts.map((alert) => (
                    <li key={alert.key}>
                      <button
                        type="button"
                        onClick={() => go(alert.href)}
                        className="w-full px-4 py-2.5 flex items-start gap-3 text-left hover:bg-[#FAFAFA] transition-colors cursor-pointer"
                      >
                        <alert.icon
                          className={`w-4 h-4 shrink-0 mt-0.5 ${
                            alert.tone === 'bad' ? 'text-[#C8202D]' : 'text-[#B4740A]'
                          }`}
                        />
                        <span className="text-xs text-[#17181D] leading-snug">{alert.text}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}
        </div>

        <span className="hidden sm:block w-px h-6 bg-[#E6E7EB]" />

        {/* User */}
        <div className="relative">
          <button
            type="button"
            id="topbar-user-btn"
            onClick={() => setOpen(open === 'user' ? null : 'user')}
            aria-expanded={open === 'user'}
            className="flex items-center gap-2.5 pl-1 pr-2 py-1 rounded-full hover:bg-[#F6F6F8] transition-colors cursor-pointer"
          >
            <span className="w-9 h-9 rounded-full bg-[#C8202D] text-white text-xs font-bold flex items-center justify-center shrink-0">
              {CURRENT_USER.initials}
            </span>
            <span className="hidden md:block text-left leading-tight">
              <span className="block text-xs font-bold text-[#17181D]">{CURRENT_USER.name}</span>
              <span className="block text-[11px] text-[#6B6F76]">{CURRENT_USER.role}</span>
            </span>
            <ChevronDown className="hidden md:block w-4 h-4 text-[#9CA1A9]" />
          </button>

          {open === 'user' && (
            <Panel className="right-0 w-56">
              <div className="px-4 py-3 border-b border-[#EFEFF2] md:hidden">
                <p className="text-xs font-bold text-[#17181D]">{CURRENT_USER.name}</p>
                <p className="text-[11px] text-[#6B6F76]">{CURRENT_USER.role}</p>
              </div>
              <div className="py-1.5">
                <Link
                  href="/checklist"
                  onClick={() => setOpen(null)}
                  className="w-full px-4 py-2 flex items-center gap-2.5 text-xs font-semibold text-[#17181D] hover:bg-[#FAFAFA] transition-colors"
                >
                  <ClipboardList className="w-4 h-4 text-[#6B6F76]" />
                  Checklist setup
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="w-full px-4 py-2 flex items-center gap-2.5 text-xs font-semibold text-[#C8202D] hover:bg-[#FDECEE] transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  Sign out
                </button>
              </div>
            </Panel>
          )}
        </div>
      </div>
    </div>
  );
};

/** The dropdown shell. One place for the surface, so all three panels match. */
const Panel: React.FC<{ className?: string; children: React.ReactNode }> = ({
  className = '',
  children,
}) => (
  <div
    className={`absolute top-[calc(100%+0.5rem)] bg-white border border-[#E6E7EB] rounded-xl shadow-lg overflow-hidden z-30 ${className}`}
  >
    {children}
  </div>
);
