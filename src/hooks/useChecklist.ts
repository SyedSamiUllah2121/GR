'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChecklistDoc } from '../types';
import {
  ChecklistView,
  buildView,
  getChecklist,
  subscribeToChecklist,
} from '../services/checklistStore';

/**
 * The live checklist, kept in step with edits made on the Checklist screen
 * (including from another tab).
 */
export function useChecklist(): ChecklistView {
  const [doc, setDoc] = useState<ChecklistDoc>(() => getChecklist());

  useEffect(() => {
    const refresh = () => setDoc(getChecklist());
    refresh();
    return subscribeToChecklist(refresh);
  }, []);

  return useMemo(() => buildView(doc), [doc]);
}
