'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { CalendarClock, PenLine, Wrench } from 'lucide-react';
import { Branch, Inspection, MaintenanceJob, User, branchesOf } from '../types';
import { getInspections, subscribeToStorage } from '../services/storage';
import { getJobs, subscribeToMaintenance } from '../services/maintenanceStore';
import { formatDateTime, formatTimeOnly } from '../services/reportModel';
import { can, visibleInspections, visibleJobs } from '../services/permissions';
import { assignmentsFor, isOverdueAssignment, scheduleLabel } from '../services/assignments';
import { mondayStatusFor } from '../services/mondaySchedule';
import { activeBranches } from '../services/branchStore';
import { useBranches } from './useBranches';

/**
 * What is outstanding for the signed-in account, read once for the whole of
 * the app's chrome: the bell's list, the status strip across the top and the
 * counts on the sidebar. One source, so the three cannot disagree with each
 * other, nor with what the dashboard says needs doing.
 *
 * Everything is narrowed to what the account may see before anything counts
 * it, so a branch manager is not chased about a branch that is not theirs,
 * and an inspector is not offered records they cannot open.
 */

export interface Alert {
  key: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  text: string;
  tone: 'bad' | 'warn';
  /**
   * What the alert is about, so the strip and the sidebar can count one
   * kind without reading the wording: a round or visit that is due or late,
   * an unfinished draft, the repair backlog, or records left unsigned.
   */
  kind: 'visit' | 'draft' | 'jobs' | 'unsigned';
}

export interface Outstanding {
  /** Every inspection, unscoped — for the branch switcher's own statuses. */
  allInspections: Inspection[];
  /** Inspections the account may see. */
  inspections: Inspection[];
  /** Maintenance jobs the account may see. */
  jobs: MaintenanceJob[];
  /** Open branches the account has standing at. */
  branches: Branch[];
  alerts: Alert[];
  /** Jobs still open, of those the account may see. */
  openJobs: MaintenanceJob[];
  /** Rounds and visits due today or waiting, and those already late. */
  visitsDue: number;
  visitsLate: number;
  /** Submitted inspections dated this week, Monday to Sunday. */
  thisWeek: number;
  /** The date of the newest submitted inspection, or null. */
  latestDate: string | null;
}

/** Today as a plain local ISO date, matching how records store their dates. */
export function todayIso(): string {
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

/** This week's Monday as a plain ISO date. */
function mondayIso(today: string): string {
  const d = new Date(`${today}T00:00:00Z`);
  const back = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - back);
  return d.toISOString().slice(0, 10);
}

export function useOutstanding(user: User | null): Outstanding {
  const [allInspections, setInspections] = useState<Inspection[]>(() => getInspections());
  const [allJobs, setJobs] = useState<MaintenanceJob[]>(() => getJobs());
  const allBranches = useBranches();

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

  /*
   * Scoped to the account before anything else looks at it, so neither the
   * search nor the alert list can leak a branch someone has no business
   * seeing. Closed branches drop out too: they are not chased for being
   * overdue.
   */
  const inspections = useMemo(
    () => visibleInspections(user, allInspections),
    [user, allInspections]
  );

  const branches = useMemo(() => {
    const open = activeBranches(allBranches);
    if (can(user, 'inspections.viewAll')) return open;
    if (user?.role === 'branch-manager') {
      const own = branchesOf(user);
      return open.filter((b) => own.includes(b.name));
    }
    // An inspector has no standing at a branch beyond the visit itself
    return [];
  }, [user, allBranches]);

  /*
   * Narrowed exactly as the board is, so the alerts and the search agree with
   * what the screens behind them will show. The admin and the maintenance
   * manager get every job; a branch manager gets their own branch's repairs;
   * an inspector gets none, having no standing at a branch beyond the visit
   * itself.
   */
  const jobs = useMemo(() => visibleJobs(user, allJobs), [user, allJobs]);
  const openJobs = useMemo(() => jobs.filter((j) => j.completedAt === null), [jobs]);

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
        kind: 'draft',
      });
    }

    /*
     * The one thing an inspector is here for: the visits handed to them.
     * Nothing else in this list applies — they hold no branch, so being
     * overdue is not theirs to answer for.
     */
    if (user?.role === 'inspector') {
      assignmentsFor(user.id, inspections).forEach((visit) => {
        // A visit booked for a time that has passed is a different message
        // from one simply waiting, and a worse one
        const late = isOverdueAssignment(visit);
        const booked = scheduleLabel(visit, formatDateTime, formatTimeOnly);
        out.push({
          key: `assigned-${visit.id}`,
          href: '/inspections',
          icon: CalendarClock,
          text: booked
            ? `Surprise visit to ${visit.branchName} ${late ? 'was due' : 'due'} ${booked}`
            : `Surprise visit to ${visit.branchName} waiting to be started`,
          tone: late ? 'bad' : 'warn',
          kind: 'visit',
        });
      });
      return out;
    }

    /*
     * A branch manager is chased about one thing: this week's round. The
     * generic overdue alert below would say the same thing less precisely —
     * it counts seven days from the last visit of any kind, where the round
     * is due on the Monday whether or not an inspector called on Thursday.
     */
    const ownBranches = branchesOf(user);
    ownBranches.forEach((branch) => {
      const monday = mondayStatusFor(branch, inspections);
      if (!monday.done) {
        // Named only when there is more than one round to tell apart
        const where = ownBranches.length > 1 ? `${branch}: ` : '';
        out.push({
          key: `monday-${branch}`,
          href: '/inspections',
          icon: CalendarClock,
          text: where + (monday.overdue
            ? `Monday inspection is ${monday.daysLate} day${
                monday.daysLate === 1 ? '' : 's'
              } late`
            : 'Monday inspection is due today'),
          tone: monday.overdue ? 'bad' : 'warn',
          kind: 'visit',
        });
      }
    });

    // Chasing every branch's cadence is the admin's job — the manager above
    // has already been told about their own, more precisely.
    const chased = can(user, 'inspections.viewAll') ? branches : [];

    chased.forEach((b) => {
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
          kind: 'visit',
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
          kind: 'visit',
        });
      }
    });

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
        kind: 'jobs',
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
        kind: 'unsigned',
      });
    }

    return out;
  }, [user, inspections, openJobs, branches]);

  const summary = useMemo(() => {
    const today = todayIso();
    const weekStart = mondayIso(today);
    const submitted = inspections.filter((i) => i.status === 'submitted');
    const visits = alerts.filter((a) => a.kind === 'visit');
    return {
      visitsDue: visits.filter((a) => a.tone === 'warn').length,
      visitsLate: visits.filter((a) => a.tone === 'bad').length,
      thisWeek: submitted.filter((i) => i.date >= weekStart && i.date <= today).length,
      latestDate:
        submitted.reduce<string | null>((max, i) => (max && max >= i.date ? max : i.date), null),
    };
  }, [inspections, alerts]);

  return { allInspections, inspections, jobs, branches, alerts, openJobs, ...summary };
}
