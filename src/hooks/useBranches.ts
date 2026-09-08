'use client';

import { useEffect, useState } from 'react';
import { Branch } from '../types';
import { getBranches, subscribeToBranches } from '../services/branchStore';

/**
 * The live branch list, kept in step with branches added elsewhere in the app
 * (including from another tab).
 */
export function useBranches(): Branch[] {
  const [branches, setBranches] = useState<Branch[]>(() => getBranches());

  useEffect(() => {
    const refresh = () => setBranches(getBranches());
    refresh();
    return subscribeToBranches(refresh);
  }, []);

  return branches;
}
