'use client';

import React from 'react';
import { motion } from 'motion/react';
import { AlertCircle, CheckCircle2, X } from 'lucide-react';
import { EASE_OUT, t } from './motion';

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
 *
 * It rises and fades in from the bottom edge, so it is noticed arriving
 * rather than simply being there. The transform is on the toast itself,
 * which holds nothing fixed, so nothing else on the page is moved by it.
 */
export const Toast: React.FC<ToastProps> = ({ message, tone = 'success', onClose }) => {
  const error = tone === 'error';
  return (
    <motion.div
      id="toast-notification"
      data-tone={tone}
      initial={{ opacity: 0, y: 16, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: t(0.35), ease: EASE_OUT }}
      className={`fixed bottom-6 right-6 left-6 sm:left-auto sm:max-w-md z-[60] flex items-start gap-3 pl-3 pr-2 py-3 rounded-2xl border shadow-[0_20px_44px_-16px_rgba(16,24,40,0.45),0_2px_6px_-2px_rgba(16,24,40,0.12)] ${
        error
          ? 'bg-white text-[#17181D] border-[#F3C6CB]'
          : 'bg-[#17181D] text-[#F6F6F8] border-[#2E3038]'
      }`}
      role={error ? 'alert' : 'status'}
    >
      <span
        className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
          error ? 'bg-[#FDECEE] text-[#C8202D]' : 'bg-[#4CC38A]/15 text-[#4CC38A]'
        }`}
      >
        {error ? <AlertCircle className="w-[18px] h-[18px]" /> : <CheckCircle2 className="w-[18px] h-[18px]" />}
      </span>
      <span
        className={`text-[13px] font-semibold leading-snug flex-1 min-w-0 pt-[7px] ${
          error ? 'text-[#8F1520]' : ''
        }`}
      >
        {message}
      </span>
      <button
        type="button"
        onClick={onClose}
        className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 cursor-pointer transition-colors ${
          error
            ? 'text-[#8F1520]/60 hover:text-[#8F1520] hover:bg-[#FDECEE]'
            : 'text-[#F6F6F8]/60 hover:text-white hover:bg-white/10'
        }`}
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
};
