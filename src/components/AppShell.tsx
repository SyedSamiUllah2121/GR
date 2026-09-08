'use client';

import {useEffect} from 'react';
import {usePathname, useRouter} from 'next/navigation';
import {Sidebar} from './Sidebar';
import {Topbar} from './Topbar';
import {ToastProvider} from './ToastProvider';
import {getInspections} from '../services/storage';
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
