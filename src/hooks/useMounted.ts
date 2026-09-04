'use client';

import {useEffect, useState} from 'react';

/**
 * False during server rendering and the first client render, true afterwards.
 * Inspection data lives in localStorage, which does not exist on the server, so
 * anything that reads it has to wait for this flag to avoid a hydration mismatch.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return mounted;
}
