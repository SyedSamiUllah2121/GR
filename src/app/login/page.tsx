'use client';

import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {LoginScreen} from '@/components/LoginScreen';
import {isAuthenticated} from '@/services/storage';
import {useMounted} from '@/hooks/useMounted';

export default function LoginPage() {
  const router = useRouter();
  const mounted = useMounted();

  // Only known once we are on the client, so the form still renders on the
  // server and during hydration — the common case is a signed-out visitor.
  const alreadySignedIn = mounted && isAuthenticated();

  useEffect(() => {
    if (alreadySignedIn) {
      router.replace('/inspections');
    }
  }, [alreadySignedIn, router]);

  if (alreadySignedIn) return null;

  return <LoginScreen />;
}
