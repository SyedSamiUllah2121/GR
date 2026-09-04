'use client';

import {useEffect, useState} from 'react';
import {useRouter} from 'next/navigation';
import {Sidebar} from '@/components/Sidebar';
import {ToastProvider} from '@/components/ToastProvider';
import {getInspections, isAuthenticated, subscribeToStorage} from '@/services/storage';
import {useMounted} from '@/hooks/useMounted';

export default function InspectionsLayout({
  children,
}: Readonly<{children: React.ReactNode}>) {
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
      <div className="min-h-screen bg-[#F5F3EC] flex flex-col md:flex-row text-[#242217]">
        {/* Persistent left sidebar (top bar on mobile) */}
        <Sidebar />

        <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">{children}</main>
      </div>
    </ToastProvider>
  );
}
