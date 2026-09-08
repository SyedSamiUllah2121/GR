'use client';

import {useEffect, useState} from 'react';
import {useRouter} from 'next/navigation';
import {Sidebar} from './Sidebar';
import {Topbar} from './Topbar';
import {ToastProvider} from './ToastProvider';
import {getInspections, isAuthenticated, subscribeToStorage} from '../services/storage';
import {useMounted} from '../hooks/useMounted';

/**
 * Signed-in chrome: sidebar, top bar, toasts and the auth guard. Shared by
 * every route behind the login screen.
 */
export function AppShell({children}: Readonly<{children: React.ReactNode}>) {
  const router = useRouter();
  const mounted = useMounted();
  const [authed, setAuthed] = useState(false);

  // Seed the demo records on first run.
  useEffect(() => {
    getInspections();
  }, []);

  // Keep auth state in sync with storage (also covers sign-out from another tab).
  useEffect(() => {
    const check = () => setAuthed(isAuthenticated());
    check();
    return subscribeToStorage(check);
  }, []);

  useEffect(() => {
    if (mounted && !authed) {
      router.replace('/login');
    }
  }, [mounted, authed, router]);

  if (!mounted || !authed) return null;

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
