import React from 'react';
import { CheckCircle2, X } from 'lucide-react';

interface ToastProps {
  message: string;
  onClose: () => void;
}

export const Toast: React.FC<ToastProps> = ({ message, onClose }) => {
  return (
    <div
      id="toast-notification"
      className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 bg-[#17181D] text-[#F6F6F8] rounded-md shadow-lg border border-[#2E3038]"
      role="status"
    >
      <CheckCircle2 className="w-5 h-5 text-[#4CC38A]" />
      <span className="text-sm font-semibold">{message}</span>
      <button
        onClick={onClose}
        className="ml-2 p-1 text-[#F6F6F8]/70 hover:text-white rounded"
        aria-label="Dismiss notification"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
