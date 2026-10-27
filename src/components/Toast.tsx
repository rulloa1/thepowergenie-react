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
        "fixed left-1/2 -translate-x-1/2 z-[75] transition-all duration-500 ease-out",
        isVisible 
          ? "bottom-24 sm:bottom-12 opacity-100 scale-100 translate-y-0 pointer-events-none" 
          : "bottom-12 opacity-0 scale-95 translate-y-4 pointer-events-none"
      )}
      aria-hidden={isVisible ? undefined : true}
    >
      <div
        role="status"
        aria-live="polite"
        className={cn(
          "bg-white/95 backdrop-blur-md border border-[rgba(26,26,46,0.08)] rounded-2xl shadow-[0_20px_50px_rgba(10,20,40,0.2)] p-4 sm:p-5 flex items-start gap-4 min-w-[300px] max-w-[90vw]",
          isVisible ? "pointer-events-auto" : "pointer-events-none"
        )}
      >
        <div className="flex-none w-10 h-10 rounded-full bg-green-50 border border-green-100 flex items-center justify-center">
          <CheckCircle2 className="w-5 h-5 text-green-600" />
        </div>
        <div className="flex-1 min-w-0 pr-6">
          <p className="text-[#1A1A2E] font-bold text-[0.95rem] leading-snug">
            {message}
          </p>
          {submessage && (
            <p className="text-[#4A5568] text-[0.82rem] mt-1 font-medium leading-relaxed">
              {submessage}
            </p>
          )}
        </div>
        <button
          onClick={onClose}
          className="absolute top-3 right-3 p-1.5 text-[#4A5568] hover:text-[#1A1A2E] hover:bg-gray-100 active:scale-95 rounded-lg transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-600 focus-visible:ring-offset-1"
          aria-label="Close notification"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
