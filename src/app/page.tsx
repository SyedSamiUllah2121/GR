'use client';

import {useEffect} from 'react';
import {useRouter} from 'next/navigation';
import {isAuthenticated} from '@/services/storage';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(isAuthenticated() ? '/dashboard' : '/login');
  }, [router]);

  return null;
}
