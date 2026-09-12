'use client';

import { useEffect, useState } from 'react';
import { EquipmentCategory } from '../types';
import { getCategories, subscribeToCategories } from '../services/categoryStore';

/**
 * The live category list, kept in step with categories added or renamed
 * elsewhere in the app (including from another tab).
 */
export function useCategories(): EquipmentCategory[] {
  const [categories, setCategories] = useState<EquipmentCategory[]>(() => getCategories());

  useEffect(() => {
    const refresh = () => setCategories(getCategories());
    refresh();
    return subscribeToCategories(refresh);
  }, []);

  return categories;
}
