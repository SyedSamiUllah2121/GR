'use client';

import {useEffect} from 'react';
import {usePathname, useRouter} from 'next/navigation';
import {Sidebar} from './Sidebar';
import {Topbar} from './Topbar';
import {ToastProvider} from './ToastProvider';
import {getInspections} from '../services/storage';
import {sweepSchedule} from '../services/maintenanceSchedule';
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
    if (failed > 0) {
      console.error(
        `Maintenance schedule: ${failed} due job(s) could not be stored — the browser store is full`
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

  if (!mounted || !allowed) return null;

  return (
    <ToastProvider>
      <div className="min-h-screen bg-[#F6F6F8] flex flex-col md:flex-row text-[#17181D]">
        {/* Persistent left rail (top bar on mobile) */}
        <Sidebar />

        <main className="flex-1 flex flex-col min-w-0">
          <Topbar />
          <div className="flex-1 flex flex-col min-w-0">{children}</div>
        </main>
      </div>
    </ToastProvider>
  );
}
