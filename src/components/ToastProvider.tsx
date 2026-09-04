'use client';

import React, {createContext, useCallback, useContext, useEffect, useState} from 'react';
import {Toast} from './Toast';

const ToastContext = createContext<(message: string) => void>(() => {});

/**
 * Shows a floating confirmation toast. The provider lives in the inspections
 * layout, so a toast raised just before a route change survives the navigation.
 */
export function useToast(): (message: string) => void {
  return useContext(ToastContext);
}

export const ToastProvider: React.FC<{children: React.ReactNode}> = ({children}) => {
  const [message, setMessage] = useState<string | null>(null);

  const showToast = useCallback((next: string) => {
    setMessage(next);
  }, []);

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 4000);
    return () => clearTimeout(timer);
  }, [message]);

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {message && <Toast message={message} onClose={() => setMessage(null)} />}
    </ToastContext.Provider>
  );
};
