import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/assets/brand/power-genie-lockup.webp"
      alt="The Power Genie"
      className={cn('block h-10 w-auto rounded-xl bg-[#071b27] px-2.5 py-1', className)}
    />
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn('inline-block h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent', className)}
    />
  );
}

export function Notice({
  tone = 'info',
  title,
  children,
}: {
  tone?: 'info' | 'warn' | 'error' | 'success';
  title?: string;
  children?: React.ReactNode;
}) {
  const tones = {
    info: 'bg-[#EEF5FF] border-[#C9DDF7] text-[#123A63]',
    warn: 'bg-[#FFF6E8] border-[#F5D9A8] text-[#7A4A06]',
    error: 'bg-[#FFF0EE] border-[#F3C2BB] text-[#8A1F11]',
    success: 'bg-[#EEF9F0] border-[#BFE3C6] text-[#185A26]',
  };
  return (
    <div className={cn('rounded-2xl border px-4 py-3 text-[0.92rem] leading-relaxed', tones[tone])} role={tone === 'error' ? 'alert' : 'status'}>
      {title && <p className="m-0 font-semibold">{title}</p>}
      {children && <div className={cn(title && 'mt-1')}>{children}</div>}
    </div>
  );
}

/** Shown whenever the site hasn't been given its Supabase/Google keys yet. */
export function NotConfigured({ what }: { what: string }) {
  return (
    <div className="mx-auto max-w-md px-5 py-16 text-center">
      <BrandMark className="mx-auto mb-8" />
      <h1 className="m-0 text-2xl font-bold tracking-tight text-[#1A1A2E]">{what} isn't configured yet</h1>
      <p className="mt-3 text-[#4A5568]">
        Everything is built — it just needs its keys. Once they're added, this page will come to life.
      </p>
      <p className="mt-6 text-sm text-[#4A5568]">
        Want a free solar quote now? Call <a className="font-semibold text-[#0066CC]" href="tel:+15102417007">510-241-7007</a>.
      </p>
    </div>
  );
}

export const inputClass =
  'w-full rounded-xl border border-[#D6DCE5] bg-white px-3.5 py-3 text-[1rem] text-[#1A1A2E] outline-none transition placeholder:text-[#8A94A3] focus:border-[#FF6B00] focus:ring-4 focus:ring-[#FF6B00]/15';

export const labelClass = 'mb-1.5 block text-[0.86rem] font-semibold text-[#1A1A2E]';

export function Button({
  variant = 'primary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'ghost' | 'danger' | 'quiet' }) {
  const variants = {
    primary: 'bg-[#1A1A2E] text-white hover:bg-[#2A2A44] disabled:bg-[#9AA1AD]',
    ghost: 'border border-[#D6DCE5] bg-white text-[#1A1A2E] hover:border-[#1A1A2E]',
    danger: 'border border-[#F3C2BB] bg-white text-[#B42318] hover:bg-[#FFF0EE]',
    quiet: 'text-[#0066CC] hover:underline px-0',
  };
  return (
    <button
      {...props}
      className={cn(
        'inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full px-5 text-[0.95rem] font-semibold transition disabled:cursor-not-allowed',
        variants[variant],
        variant === 'quiet' && 'min-h-0 rounded-none',
        className,
      )}
    />
  );
}
