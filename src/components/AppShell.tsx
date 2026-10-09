'use client';

import React, {useEffect, useState} from 'react';
import {usePathname, useRouter} from 'next/navigation';
import {Sidebar} from './Sidebar';
import {Topbar} from './Topbar';
import {ToastProvider} from './ToastProvider';
import {ConfirmProvider} from './ConfirmProvider';
import {MotionProvider, t} from './motion';
import {motion} from 'motion/react';
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
    <MotionProvider>
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

        {/*
          The header spans the window, with the rail and the page side by
          side beneath it. Below `md` the rail becomes a row of sections
          under the header instead.
        */}
        <div className="min-h-screen bg-[#F6F6F8] flex flex-col text-[#17181D]">
          <Topbar />

          <div className="flex-1 flex flex-col md:flex-row min-w-0">
          <Sidebar />

          <main id="main-content" tabIndex={-1} className="flex-1 flex flex-col min-w-0">
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
            {/*
              Each page fades in as it arrives. Opacity only, never a slide:
              a transform here would become the containing block for every
              `position: fixed` dialog and sticky bar on the page below it.
            */}
            <motion.div
              key={pathname}
              className="flex-1 flex flex-col min-w-0"
              initial={{opacity: 0}}
              animate={{opacity: 1}}
              transition={{duration: t(0.25)}}
            >
              {children}
            </motion.div>
          </main>
          </div>
        </div>
      </ConfirmProvider>
    </ToastProvider>
    </MotionProvider>
  );
}

/**
 * What stands in for the app while the browser store is being read.
 *
 * Deliberately not a spinner: the wait is a few frames, and a spinner that
 * flashes up and goes reads as a stutter rather than as loading. Instead a
 * grey cast of the real furniture — the strip and header across the top,
 * the rail on its own gradient with its rows, a heading and the dashboard's
 * cards — so the
 * page that arrives lands exactly where its outline already was. The pulse
 * stops for anyone whose device asks for less motion.
 */
const SKELETON = 'animate-pulse motion-reduce:animate-none';

const AppShellFallback: React.FC = () => (
  <div className="min-h-screen bg-[#F6F6F8] flex flex-col" role="status" aria-label="Loading">
    <div className="hidden md:block h-9 bg-[linear-gradient(90deg,#B51C28_0%,#A21A24_100%)]" />
    <div className="h-16 md:h-[4.25rem] bg-white border-b border-[#E8E9EE] flex items-center gap-5 px-4 sm:px-6 lg:px-8">
      <div className={`h-9 w-10 sm:w-[10.5rem] rounded-lg bg-[#F4F5F7] ${SKELETON}`} />
      <div className={`h-10 flex-1 max-w-xl lg:mx-auto rounded-xl bg-[#F4F5F7] ${SKELETON}`} />
      <div className="ml-auto lg:ml-0 flex items-center gap-2">
        <div className={`w-10 h-10 rounded-xl bg-[#F4F5F7] ${SKELETON}`} />
        <div className={`w-8 h-8 rounded-full bg-[#ECEDF0] ${SKELETON}`} />
      </div>
    </div>
    <div className="flex-1 flex flex-col md:flex-row min-w-0">
      <div className="w-full md:w-[16rem] md:h-[calc(100vh-6.5rem)] shrink-0 bg-[radial-gradient(140%_45%_at_0%_0%,rgba(255,255,255,0.13),transparent_70%),linear-gradient(180deg,#B51C28_0%,#A21A24_45%,#8E141D_100%)] px-4 py-3 md:pt-14 flex flex-col gap-3 md:gap-2 overflow-hidden">
        <div className="flex md:flex-col gap-1 md:gap-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-11 w-32 md:w-auto shrink-0 rounded-xl bg-white/[0.07] flex items-center gap-3 pl-1.5">
              <span className="w-8 h-8 rounded-lg bg-white/10" />
              <span className={`h-2.5 w-24 rounded bg-white/15 ${SKELETON}`} />
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 min-w-0 p-5 sm:p-6 md:p-8 lg:p-10 space-y-6 max-w-[1440px] w-full mx-auto">
        <div className="space-y-2.5">
          <div className={`h-2.5 w-36 rounded bg-[#E8E9EE] ${SKELETON}`} />
          <div className={`h-8 w-56 rounded-lg bg-[#E4E6EB] ${SKELETON}`} />
          <div className={`h-3 w-72 max-w-full rounded bg-[#ECEDF0] ${SKELETON}`} />
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
          <div className={`xl:col-span-7 h-72 rounded-2xl bg-white border border-[#E8E9EE] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_2px_8px_-2px_rgba(16,24,40,0.06)] ${SKELETON}`} />
          <div className="xl:col-span-5 grid grid-cols-1 sm:grid-cols-2 gap-5">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className={`h-[8.5rem] rounded-2xl bg-white border border-[#E8E9EE] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_2px_8px_-2px_rgba(16,24,40,0.06)] ${SKELETON}`}
              />
            ))}
          </div>
        </div>
        <div className={`h-64 rounded-2xl bg-white border border-[#E8E9EE] shadow-[0_1px_2px_rgba(16,24,40,0.04),0_2px_8px_-2px_rgba(16,24,40,0.06)] ${SKELETON}`} />
      </div>
    </div>
  </div>
);
