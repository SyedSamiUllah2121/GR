'use client';

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { useDialog } from '../hooks/useDialog';

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
    <div
      ref={dialogRef}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-title"
      aria-describedby={request.body ? 'confirm-body' : undefined}
      className="fixed inset-0 z-[60] bg-[#17181D]/50 flex items-start sm:items-center justify-center p-4 overflow-y-auto"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-white border border-[#E6E7EB] rounded-lg shadow-lg w-full max-w-md my-8">
        <div className="px-6 py-5 flex items-start gap-3">
          <span
            className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
              destructive ? 'bg-[#FDECEE] text-[#C8202D]' : 'bg-[#F6F6F8] text-[#6B6F76]'
            }`}
          >
            <AlertTriangle className="w-[18px] h-[18px]" />
          </span>
          <div className="min-w-0">
            <h3 id="confirm-title" className="text-base font-bold text-[#17181D]">
              {request.title}
            </h3>
            {request.body && (
              <p id="confirm-body" className="text-xs text-[#6B6F76] mt-1 leading-relaxed">
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
        <div className="px-6 py-4 border-t border-[#E6E7EB] flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2.5 bg-white hover:bg-[#F6F6F8] border border-[#E6E7EB] text-xs font-semibold text-[#17181D] rounded-md transition-colors cursor-pointer"
          >
            {request.cancelLabel ?? 'Cancel'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2.5 text-white text-xs font-semibold rounded-md transition-colors cursor-pointer ${
              destructive ? 'bg-[#C8202D] hover:bg-[#A81823]' : 'bg-[#17181D] hover:bg-black'
            }`}
          >
            {request.confirmLabel ?? 'Confirm'}
          </button>
        </div>
      </div>
    </div>
  );
};
