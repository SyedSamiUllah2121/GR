'use client';

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { motion } from 'motion/react';
import { AlertTriangle } from 'lucide-react';
import { useDialog } from '../hooks/useDialog';
import { EASE_OUT, t } from './motion';

/**
 * What to say before something is thrown away.
 *
 * `title` is the question, `body` the consequence, `confirmLabel` the verb —
 * "Delete", "Withdraw", "Reset" — because a button that says OK makes the
 * reader re-read the question to find out what OK agrees to.
 */
export interface ConfirmRequest {
  title: string;
  body?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Draws the confirm button in red. On by default: nothing else asks. */
  destructive?: boolean;
}

type Ask = (request: ConfirmRequest) => Promise<boolean>;

const ConfirmContext = createContext<Ask>(async () => false);

/**
 * Asks the question and resolves to what was answered.
 *
 *   if (!(await confirm({ title: 'Delete this plan?' }))) return;
 *
 * Replaces `window.confirm`, which the app used to use throughout. The native
 * one cannot be read on a phone without squinting at a strip pinned to the
 * top of the browser, gives no room to say what is about to be lost, labels
 * its buttons OK and Cancel whatever the question, and on some browsers
 * offers to suppress every later one — which would have silently turned the
 * next delete into a click with no question attached at all.
 */
export function useConfirm(): Ask {
  return useContext(ConfirmContext);
}

export const ConfirmProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  /*
   * The waiting caller. Held in a ref rather than in state because it is not
   * drawn — and because settling it must not wait for a render to land.
   */
  const settle = useRef<((answer: boolean) => void) | null>(null);

  const ask = useCallback<Ask>((next) => {
    // Anything already waiting is answered no, so a caller is never left
    // holding a promise that will not settle.
    settle.current?.(false);
    setRequest(next);
    return new Promise<boolean>((resolve) => {
      settle.current = resolve;
    });
  }, []);

  const answer = (value: boolean) => {
    settle.current?.(value);
    settle.current = null;
    setRequest(null);
  };

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      {request && (
        <ConfirmDialog
          request={request}
          onCancel={() => answer(false)}
          onConfirm={() => answer(true)}
        />
      )}
    </ConfirmContext.Provider>
  );
};

const ConfirmDialog: React.FC<{
  request: ConfirmRequest;
  onCancel: () => void;
  onConfirm: () => void;
}> = ({ request, onCancel, onConfirm }) => {
  const dialogRef = useDialog<HTMLDivElement>(onCancel);
  const destructive = request.destructive ?? true;

  return (
    /*
     * The scrim fades and the panel rises into place. Both are plain opacity
     * and a transform on the panel itself — the scrim is the fixed element,
     * and nothing inside the panel is fixed, so nothing is re-anchored by it.
     * No exit animation: the answer is already given by the time it would
     * play, and the page behind should be usable the moment it is.
     */
    <motion.div
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby={request.body ? 'confirm-body' : undefined}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: t(0.2), ease: EASE_OUT }}
      className="fixed inset-0 z-[60] bg-[#17181D]/45 backdrop-blur-[2px] flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <motion.div
        initial={{ opacity: 0, y: 12, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: t(0.3), ease: EASE_OUT }}
        className="bg-white border border-[#E8E9EE] rounded-2xl shadow-[0_24px_60px_-20px_rgba(16,24,40,0.45),0_2px_8px_-2px_rgba(16,24,40,0.08)] w-full max-w-md my-8 overflow-hidden"
      >
        <div className="px-6 pt-6 pb-5 flex items-start gap-4">
          <span
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
              destructive ? 'bg-[#FDECEE] text-[#C8202D]' : 'bg-[#F4F5F7] text-[#17181D]'
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </span>
          <div className="min-w-0 pt-0.5">
            <h3 id="confirm-title" className="text-[15px] font-bold text-[#17181D] leading-snug">
              {request.title}
            </h3>
            {request.body && (
              <p id="confirm-body" className="text-[13px] text-[#6B6F76] mt-1.5 leading-relaxed">
                {request.body}
              </p>
            )}
          </div>
        </div>

        {/*
          Cancel first and confirm last, which puts the safe answer under the
          thumb on a phone and the deliberate one furthest from it. Both are
          full-height targets rather than the small text links the rest of the
          app uses for a cancel — this is the one place a mis-tap costs work.
        */}
        <div className="px-6 py-4 bg-[#FAFBFC] border-t border-[#F0F1F4] flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="inline-flex items-center justify-center h-10 px-4 rounded-xl border border-[#E4E6EB] bg-white text-xs font-bold text-[#17181D] shadow-xs transition-all hover:-translate-y-px hover:shadow-md cursor-pointer"
          >
            {request.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`inline-flex items-center justify-center h-10 px-4 rounded-xl text-white text-xs font-bold transition-all hover:-translate-y-px cursor-pointer ${
              destructive
                ? 'bg-[#C8202D] hover:bg-[#A81823] shadow-[0_6px_16px_-8px_rgba(200,32,45,0.6)]'
                : 'bg-[#17181D] hover:bg-black shadow-[0_6px_16px_-8px_rgba(23,24,29,0.6)]'
            }`}
          >
            {request.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
};
