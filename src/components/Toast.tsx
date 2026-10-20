import React, { useEffect } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ToastProps {
  message: string;
  submessage?: string;
  isVisible: boolean;
  onClose: () => void;
  duration?: number;
}

export default function Toast({ message, submessage, isVisible, onClose, duration = 4000 }: ToastProps) {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(() => {
        onClose();
      }, duration);
      return () => clearTimeout(timer);
    }
  }, [isVisible, duration, onClose]);

  return (
    <div
      className={cn(
        "fixed left-1/2 -translate-x-1/2 z-[100] transition-all duration-500 ease-out pointer-events-none",
        isVisible 
          ? "bottom-24 sm:bottom-12 opacity-100 scale-100 translate-y-0" 
          : "bottom-12 opacity-0 scale-95 translate-y-4"
      )}
    >
      <div className="bg-white/95 backdrop-blur-md border border-[var(--sw-ink)/10] rounded-2xl shadow-2xl p-4 sm:p-5 flex items-start gap-4 min-w-[300px] max-w-[90vw] pointer-events-auto">
        <div className="flex-none w-10 h-10 rounded-full bg-green-50 flex items-center justify-center">
          <CheckCircle2 className="w-6 h-6 text-green-600" />
        </div>
        <div className="flex-1 min-w-0 pr-6">
          <p className="text-[var(--sw-ink)] font-bold text-[0.95rem] leading-snug">
            {message}
          </p>
          {submessage && (
            <p className="text-[var(--sw-ink-soft)] text-[0.82rem] mt-1 font-medium leading-relaxed">
              {submessage}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 text-[var(--sw-ink-soft)] hover:text-[var(--sw-ink)] hover:bg-gray-100 rounded-lg transition-colors"
          aria-label="Close notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
