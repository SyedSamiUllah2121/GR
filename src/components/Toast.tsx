import React from 'react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';

export type ToastTone = 'success' | 'error';

interface ToastProps {
  message: string;
  tone?: ToastTone;
  onClose: () => void;
}

/**
 * The floating note in the corner.
 *
 * Two tones, because a refusal wearing the success tick read as the thing
 * having worked: "Could not save — storage is full" arrived with a green check
 * and was gone in four seconds. An error is red, announced as an alert rather
 * than a status, and stays long enough to be read (see ToastProvider).
 */
export const Toast: React.FC<ToastProps> = ({ message, tone = 'success', onClose }) => {
  const error = tone === 'error';
  return (
    <div
      id="toast-notification"
      data-tone={tone}
      className={`fixed bottom-6 right-6 left-6 sm:left-auto sm:max-w-md z-[60] flex items-start gap-2.5 px-4 py-3 rounded-md shadow-lg border ${
        error
          ? 'bg-[#FDECEE] text-[#8F1520] border-[#C8202D]/30'
          : 'bg-[#17181D] text-[#F6F6F8] border-[#2E3038]'
      }`}
      role={error ? 'alert' : 'status'}
    >
      {error ? (
        <AlertCircle className="w-5 h-5 text-[#C8202D] shrink-0 mt-px" />
      ) : (
        <CheckCircle2 className="w-5 h-5 text-[#4CC38A] shrink-0 mt-px" />
      )}
      <span className="text-sm font-semibold flex-1 min-w-0">{message}</span>
      <button
        type="button"
        onClick={onClose}
        className={`ml-2 p-1 rounded shrink-0 cursor-pointer ${
          error ? 'text-[#8F1520]/70 hover:text-[#8F1520]' : 'text-[#F6F6F8]/70 hover:text-white'
        }`}
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
