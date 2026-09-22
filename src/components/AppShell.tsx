'use client';

import React, {useEffect, useState} from 'react';
import {usePathname, useRouter} from 'next/navigation';
import {Sidebar} from './Sidebar';
import {Topbar} from './Topbar';
import {ToastProvider} from './ToastProvider';
import {ConfirmProvider} from './ConfirmProvider';
import {getInspections} from '../services/storage';
import {sweepSchedule} from '../services/maintenanceSchedule';
import {sweepSurpriseVisits} from '../services/assignments';
import {ensureGeneralPlans} from '../services/maintenancePlanStore';
import {getCategories} from '../services/categoryStore';
import {canAccessPath, homePathFor} from '../services/permissions';
import {useCurrentUser} from '../hooks/useCurrentUser';
import {useMounted} from '../hooks/useMounted';

/**
 * Signed-in chrome: sidebar, top bar, toasts and the access guard. Shared by
 * every route behind the login screen.
 *
 * Two things are checked here. Whether anyone is signed in at all, and
 * whether the account they are signed in as may open this particular route —
 * a branch manager who follows a link to the checklist editor, or an
 * inspector who types `/maintenance`, is sent to their own home rather than
 * shown a screen full of things they cannot use.
 *
 * Which *records* they may open is not decided here: that depends on the
 * record, so the inspection screens ask per report.
 */
export function AppShell({children}: Readonly<{children: React.ReactNode}>) {
  const router = useRouter();
  const pathname = usePathname();
  const mounted = useMounted();
  const user = useCurrentUser();
  /*
   * Work the schedule could not write, which is only ever the store being
   * full. Held in state rather than logged, because a maintenance board that
   * is quietly missing jobs is the one failure this app must never keep to
   * itself — the board reads as "nothing due", which is the same thing it
   * says when there is genuinely nothing to do.
   */
  const [unsaved, setUnsaved] = useState(0);

  // Seed the demo records on first run.
  useEffect(() => {
    getInspections();
  }, []);

  /*
   * Bring the board up to date with the servicing schedule.
   *
   * There is no server and nothing runs on a timer, so "every three months"
   * has to be worked out by somebody, and the only somebody available is the
   * app being opened. Once per mount is enough: a service that came due while
   * nobody was looking is raised the next time anyone signs in, dated the day
   * it actually fell due rather than the day it was noticed.
   *
   * Safe to run on every mount and in every open tab — each job it writes
   * carries an id derived from its plan, its asset and its due date, so a
   * second run finds the work already there and writes nothing new.
   */
  useEffect(() => {
    if (!user) return;
    /*
     * Every category has a general-maintenance plan, and this is what makes
     * that true — a category added yesterday starts raising work today without
     * anybody being sent to write its plan by hand. Idempotent and matched on
     * a derived id, so it runs before the sweep rather than beside it: the
     * sweep can only raise what a plan exists for.
     */
    ensureGeneralPlans(getCategories(), new Date().toISOString());

    const { raised, failed } = sweepSchedule();
    if (raised.length > 0) {
      console.info(`Maintenance schedule: raised ${raised.length} job(s) now due`);
    }
    setUnsaved(failed);
    if (failed > 0) {
      console.error(
        `Maintenance schedule: ${failed} due job(s) could not be stored — the browser store is full`
      );
    }

    /*
     * The same idea for inspections: an unannounced visit that fell due while
     * nobody was signed in is raised the next time somebody is. Off unless
     * the admin has set an interval, and silent when nothing is due — but a
     * schedule that is on and cannot find an inspector to send is worth a
     * line in the console, since it looks identical to one that is working.
     */
    const visit = sweepSurpriseVisits();
    if (visit.raised) {
      console.info(
        `Surprise rotation: raised a visit to ${visit.raised.branchName} for ${visit.raised.inspectorName}`
      );
    } else if (visit.reason === 'no-inspector' || visit.reason === 'no-branch') {
      console.error(
        `Surprise rotation: a visit was due on ${visit.dueOn} but there is no ${
          visit.reason === 'no-inspector' ? 'inspector to send' : 'open branch to visit'
        }`
      );
    }
  }, [user]);

  const allowed = user !== null && canAccessPath(user, pathname);

  useEffect(() => {
    if (!mounted) return;
    if (!user) {
      router.replace('/login');
      return;
    }
    if (!canAccessPath(user, pathname)) {
      router.replace(homePathFor(user));
    }
  }, [mounted, user, pathname, router]);

  /*
   * Everything is read out of the browser store, so nothing can be drawn
   * until the client has mounted. Rendering nothing left a white flash on
   * every load and made a slow phone look broken; a grey cast of the
   * furniture that is about to arrive holds the shape of the page instead.
   */
  if (!mounted || !allowed) return <AppShellFallback />;

  return (
    <ToastProvider>
      <ConfirmProvider>
        {/*
          First stop for a keyboard, and the only way past the rail without
          tabbing the whole of it on every page. Off-screen until it takes
          focus, which is the one moment it is any use to anybody.
        */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:px-4 focus:py-2.5 focus:bg-white focus:text-[#17181D] focus:text-xs focus:font-bold focus:rounded-md focus:shadow-lg focus:border focus:border-[#E6E7EB]"
        >
          Skip to main content
        </a>

        <div className="min-h-screen bg-[#F6F6F8] flex flex-col md:flex-row text-[#17181D]">
          {/* Persistent left rail (top bar on mobile) */}
          <Sidebar />

          <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col min-w-0">
            <Topbar />
            {/*
              Above the page rather than inside one screen, because the
              consequence is not local to any screen: every board, overview
              and month-end figure below is missing the same work.
            */}
            {unsaved > 0 && (
              <div
                role="alert"
                className="px-6 md:px-10 py-3 bg-[#FDECEE] border-b border-[#C8202D]/30"
              >
                <p className="text-xs font-semibold text-[#C8202D]">
                  {unsaved} scheduled{' '}
                  {unsaved === 1 ? 'service is' : 'services are'} due but could not be
                  saved — there is no room left in this browser. The board below is
                  incomplete until space is freed; removing photographs from older
                  completed jobs is the quickest way.
                </p>
              </div>
            )}
            <div className="flex-1 flex flex-col min-w-0">{children}</div>
          </main>
        </div>
      </ConfirmProvider>
    </ToastProvider>
  );
}

/**
 * What stands in for the app while the browser store is being read.
 *
 * Deliberately not a spinner: the wait is a few frames, and a spinner that
 * flashes up and goes reads as a stutter rather than as loading.
 */
const AppShellFallback: React.FC = () => (
  <div
    className="min-h-screen bg-[#F6F6F8] flex flex-col md:flex-row"
    role="status"
    aria-label="Loading"
  >
    <div className="w-full h-16 md:h-auto md:w-[16rem] md:min-h-screen bg-[#A81823] shrink-0" />
    <div className="flex-1 p-6 md:p-10 space-y-4">
      <div className="h-7 w-48 rounded-md bg-[#E6E7EB] animate-pulse" />
      <div className="h-3.5 w-72 rounded bg-[#EFEFF2] animate-pulse" />
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 pt-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-32 rounded-lg bg-white border border-[#E6E7EB] animate-pulse" />
        ))}
      </div>
      <div className="h-64 rounded-lg bg-white border border-[#E6E7EB] animate-pulse" />
    </div>
  </div>
);
