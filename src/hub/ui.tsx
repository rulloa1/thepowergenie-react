import React from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));

export function BrandMark({ className }: { className?: string }) {
  return (
    <img
      src="/assets/brand/power-genie-lockup.webp"
      alt="The Power Genie"
      className={cn('block h-10 w-auto rounded-xl bg-hub-logo px-2.5 py-1', className)}
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
    info: 'bg-hub-info border-hub-info-line text-hub-info-ink',
    warn: 'bg-hub-warn border-hub-warn-line text-hub-warn-ink',
    error: 'bg-hub-error border-hub-error-line text-hub-error-ink',
    success: 'bg-hub-success border-hub-success-line text-hub-success-ink',
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
    <div className="hub-canvas flex min-h-screen items-center justify-center px-5 py-16">
      <div className="mx-auto max-w-md text-center">
        <BrandMark className="mx-auto mb-8" />
        <h1 className="m-0 text-2xl font-bold tracking-tight text-hub-ink">{what} isn't configured yet</h1>
        <p className="mt-3 text-hub-soft">
          Everything is built — it just needs its keys. Once they're added, this page will come to life.
        </p>
        <p className="mt-6 text-sm text-hub-soft">
          Want a free solar quote now? Call <a className="font-semibold text-hub-link" href="tel:+15102417007">510-241-7007</a>.
        </p>
      </div>
    </div>
  );
}

export const inputClass =
  'w-full rounded-xl border border-hub-control bg-hub-surface px-3.5 py-3 text-[0.98rem] text-hub-ink outline-none transition-all duration-150 placeholder:text-hub-faint hover:border-hub-ink focus:border-hub-focus focus:ring-4 focus:ring-hub-focus-soft';

export const labelClass = 'mb-1.5 block text-[0.84rem] font-bold text-hub-ink tracking-tight';

export function Button({
  variant = 'primary',
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'accent' | 'ghost' | 'danger' | 'quiet' }) {
  const variants = {
    primary: 'border border-hub-on-primary bg-hub-primary text-hub-on-primary hover:bg-hub-primary-hover shadow-sm hover:shadow active:scale-[0.99] disabled:border-hub-control disabled:bg-hub-disabled disabled:text-hub-soft',
    accent: 'border border-hub-on-accent bg-hub-accent-fill text-hub-on-accent hover:bg-hub-accent-fill-hover shadow-sm hover:shadow-md active:scale-[0.99] disabled:border-hub-control disabled:bg-hub-disabled disabled:text-hub-soft',
    ghost: 'border border-hub-control bg-hub-surface text-hub-ink hover:border-hub-ink hover:bg-hub-muted active:scale-[0.99]',
    danger: 'border border-hub-danger-line bg-hub-surface text-hub-danger hover:bg-hub-danger-soft active:scale-[0.99]',
    quiet: 'text-hub-link hover:text-hub-link-hover hover:underline px-0',
  };
  return (
    <button
      {...props}
      className={cn(
        'inline-flex min-h-[44px] cursor-pointer items-center justify-center gap-2 rounded-xl px-5 text-[0.92rem] font-bold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-hub-focus focus-visible:ring-offset-2 focus-visible:ring-offset-hub-bg disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100',
        variants[variant],
        variant === 'quiet' && 'min-h-0 rounded-none',
        className,
      )}
    />
  );
}
