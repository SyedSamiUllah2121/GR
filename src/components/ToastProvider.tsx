'use client';

import React, {createContext, useCallback, useContext, useEffect, useState} from 'react';
import {Toast, ToastTone} from './Toast';

type ShowToast = (message: string, tone?: ToastTone) => void;

const ToastContext = createContext<ShowToast>(() => {});

/**
 * Shows a floating toast: a confirmation by default, or pass `'error'` for a
 * refusal or a failure. The provider lives in the app shell, so a toast raised
 * just before a route change survives the navigation.
 */
export function useToast(): ShowToast {
  return useContext(ToastContext);
}

/** How long each tone stays up. An error is read, not glanced at. */
const DURATION: Record<ToastTone, number> = { success: 4000, error: 9000 };

export const ToastProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [toast, setToast] = useState<{message: string; tone: ToastTone; id: number} | null>(null);

  const showToast = useCallback<ShowToast>((message, tone = 'success') => {
    // A fresh id, so the same message twice in a row restarts its timer
    setToast({message, tone, id: Date.now()});
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), DURATION[toast.tone]);
    return () => clearTimeout(timer);
  }, [toast]);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast && (
        <Toast key={toast.id} message={toast.message} tone={toast.tone} onClose={() => setToast(null)} />
      )}
    </ToastContext.Provider>
  );
};
