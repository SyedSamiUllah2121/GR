'use client';

import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {currentUser} from '@/services/session';
import {homePathFor} from '@/services/permissions';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    // `homePathFor` answers both cases: sign-in for nobody, and the right
    // landing screen for whichever role is signed in.
    router.replace(homePathFor(currentUser()));
  }, [router]);

  return null;
}
