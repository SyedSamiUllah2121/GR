'use client';

import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {LoginScreen} from '@/components/LoginScreen';
import {homePathFor} from '@/services/permissions';
import {useCurrentUser} from '@/hooks/useCurrentUser';
import {useMounted} from '@/hooks/useMounted';

export default function LoginPage() {
  const router = useRouter();
  const mounted = useMounted();
  const user = useCurrentUser();

  // Only known once we are on the client, so the form still renders on the
  // server and during hydration — the common case is a signed-out visitor.
  const alreadySignedIn = mounted && user !== null;

  useEffect(() => {
    if (alreadySignedIn && user) {
      // The second way in — signing in from the form is the other — and both
      // have to land in the same place, which depends on the role: a
      // dashboard for anyone who has one, assigned visits for an inspector.
      router.replace(homePathFor(user));
    }
  }, [alreadySignedIn, user, router]);

  if (alreadySignedIn) return null;

  return <LoginScreen />;
}
