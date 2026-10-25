import React, { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, ChevronLeft, ChevronRight, X } from 'lucide-react';
import { lockPageScroll } from '../lib/scrollLock';
import { cn } from './ui';
import { centralDateKey, formatDay, formatTime, todayCentralKey } from './time';
import {
  WEEKDAY_LONG,
  WEEKDAY_SHORT,
  clampMonth,
  compareMonth,
  dateKey,
  daysInMonth,
  formatCivilDate,
  monthGrid,
  monthPointFromKey,
  monthRangeFromKeys,
  monthTitle,
  moveDateKey,
  parseDateKey,
  shiftMonth,
  weekEdge,
  type MonthPoint,
} from './slotCalendar';

export interface AppointmentSlot {
  start: string;
  end: string;
}

export interface SlotPickerHandle {
  open: () => void;
  focus: () => void;
}

const DESKTOP_QUERY = '(min-width: 1024px)';
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useDesktopPopover() {
  const [desktop, setDesktop] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(DESKTOP_QUERY).matches : false,
  );
  useEffect(() => {
    const media = window.matchMedia(DESKTOP_QUERY);
    const onChange = () => setDesktop(media.matches);
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);
  return desktop;
}

function focusable(root: HTMLElement) {
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.tabIndex >= 0 && !el.hasAttribute('disabled'));
}

interface Props {
  slots: AppointmentSlot[];
  value: AppointmentSlot | null;
  onChange: (slot: AppointmentSlot) => void;
}

export const SlotPicker = forwardRef<SlotPickerHandle, Props>(function SlotPicker({ slots, value, onChange }, ref) {
  const desktop = useDesktopPopover();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLButtonElement | null>(null);
  const dayHeadingRef = useRef<HTMLHeadingElement>(null);
  const pendingFocus = useRef(false);
  const titleId = useId();
  const descriptionId = useId();
  const dialogId = useId();

  const byDay = useMemo(() => {
    const map = new Map<string, AppointmentSlot[]>();
    const ordered = [...slots].sort((a, b) => a.start.localeCompare(b.start));
    for (const slot of ordered) {
      const key = centralDateKey(slot.start);
      const list = map.get(key);
      if (list) list.push(slot);
      else map.set(key, [slot]);
    }
    return map;
  }, [slots]);

  const openKeys = useMemo(() => [...byDay.keys()].sort(), [byDay]);
  const bounds = useMemo(() => monthRangeFromKeys(openKeys), [openKeys]);
  const selectedKey = value ? centralDateKey(value.start) : null;

  const [open, setOpen] = useState(false);
  const [panel, setPanel] = useState<'days' | 'times'>('days');
  const [cursor, setCursor] = useState('');
  const [visible, setVisible] = useState<MonthPoint>(() => monthPointFromKey(todayCentralKey()));

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const openPicker = useCallback(() => {
    if (!bounds || openKeys.length === 0) return;
    const start = selectedKey && byDay.has(selectedKey) ? selectedKey : openKeys[0];
    pendingFocus.current = true;
    setCursor(start);
    setVisible(monthPointFromKey(start));
    setPanel('days');
    setOpen(true);
    triggerRef.current?.scrollIntoView({ block: 'nearest' });
  }, [bounds, byDay, openKeys, selectedKey]);

  useImperativeHandle(ref, () => ({
    open: openPicker,
    focus: () => triggerRef.current?.focus(),
  }), [openPicker]);

  useEffect(() => {
    if (!bounds) return;
    setCursor((current) => (current ? moveDateKey(current, 0, bounds.min, bounds.max) : current));
    setVisible((current) => clampMonth(current, bounds.min, bounds.max));
  }, [bounds]);

  useEffect(() => {
    if (!open || openKeys.length > 0) return;
    setOpen(false);
  }, [open, openKeys.length]);

  useEffect(() => {
    if (!open || panel !== 'times' || byDay.has(cursor)) return;
    setPanel('days');
  }, [open, panel, cursor, byDay]);

  useEffect(() => {
    if (!open || desktop) return;
    return lockPageScroll();
  }, [open, desktop]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        requestAnimationFrame(() => triggerRef.current?.focus());
        return;
      }
      if (event.key !== 'Tab') return;
      const root = dialogRef.current;
      if (!root) return;
      const items = focusable(root);
      if (items.length === 0) {
        event.preventDefault();
        root.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      const inside = active instanceof Node && root.contains(active);
      if (event.shiftKey && (!inside || active === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!inside || active === last)) {
        event.preventDefault();
        first.focus();
      }
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (dialogRef.current?.contains(target)) return;
      if (triggerRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointer);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !pendingFocus.current) return;
    pendingFocus.current = false;
    const target = panel === 'times' ? dayHeadingRef.current : cursorRef.current;
    target?.focus();
  }, [open, panel, cursor, visible]);

  useLayoutEffect(() => {
    if (!open || !desktop) return;
    const dialog = dialogRef.current;
    const trigger = triggerRef.current;
    if (!dialog || !trigger) return;
    const place = () => {
      const rect = trigger.getBoundingClientRect();
      const width = dialog.offsetWidth;
      let left = rect.left;
      if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
      const gap = 8;
      const spaceBelow = window.innerHeight - rect.bottom - gap - 8;
      const spaceAbove = rect.top - gap - 8;
      const below = spaceBelow >= 280 || spaceBelow >= spaceAbove;
      const maxHeight = Math.max(240, below ? spaceBelow : spaceAbove);
      dialog.style.maxHeight = `${maxHeight}px`;
      const height = Math.min(dialog.scrollHeight, maxHeight);
      const top = below ? rect.bottom + gap : Math.max(8, rect.top - gap - height);
      dialog.style.top = `${top}px`;
      dialog.style.left = `${left}px`;
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, desktop, panel, visible]);

  const cells = monthGrid(visible);
  const weeks: (typeof cells)[] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  while (weeks.length > 0 && weeks[weeks.length - 1].every((cell) => !cell.inMonth)) weeks.pop();
  const daySlots = byDay.get(cursor) ?? [];
  const atMin = bounds ? compareMonth(visible, bounds.min) <= 0 : true;
  const atMax = bounds ? compareMonth(visible, bounds.max) >= 0 : true;

  const goMonth = (delta: number) => {
    if (!bounds) return false;
    const next = clampMonth(shiftMonth(visible, delta), bounds.min, bounds.max);
    if (compareMonth(next, visible) === 0) return false;
    const { day } = parseDateKey(cursor || dateKey(next.year, next.month, 1));
    const nextKey = dateKey(next.year, next.month, Math.min(day || 1, daysInMonth(next.year, next.month)));
    setVisible(next);
    setCursor(nextKey);
    return true;
  };

  const moveCursor = (nextKey: string) => {
    if (!bounds || nextKey === cursor) return;
    pendingFocus.current = true;
    setCursor(nextKey);
    setVisible(monthPointFromKey(nextKey));
  };

  const onGridKeyDown = (event: React.KeyboardEvent) => {
    if (!bounds || !cursor) return;
    const arrows: Record<string, number> = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7,
    };
    if (event.key in arrows) {
      event.preventDefault();
      moveCursor(moveDateKey(cursor, arrows[event.key], bounds.min, bounds.max));
      return;
    }
    if (event.key === 'Home') {
      event.preventDefault();
      moveCursor(weekEdge(cursor, 'start', bounds.min, bounds.max));
      return;
    }
    if (event.key === 'End') {
      event.preventDefault();
      moveCursor(weekEdge(cursor, 'end', bounds.min, bounds.max));
      return;
    }
    if (event.key === 'PageUp' || event.key === 'PageDown') {
      event.preventDefault();
      if (goMonth(event.key === 'PageUp' ? -1 : 1)) pendingFocus.current = true;
    }
  };

  const chooseDay = (key: string) => {
    if (!byDay.has(key)) return;
    pendingFocus.current = true;
    setCursor(key);
    setPanel('times');
  };

  const chooseTime = (slot: AppointmentSlot) => {
    onChange(slot);
    close(true);
  };

  const dialog = open ? (
    <div
      className={desktop ? undefined : 'fixed inset-0 z-[70] flex items-center justify-center p-4'}
    >
      {!desktop && (
        <div className="absolute inset-0 bg-[#0B1220]/45" onMouseDown={() => close(true)} />
      )}
      <div
        ref={dialogRef}
        id={dialogId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        tabIndex={-1}
        data-testid="slot-picker-dialog"
        data-presentation={desktop ? 'popover' : 'modal'}
        className={cn(
          'max-h-[min(40rem,calc(100dvh-2rem))] overflow-y-auto rounded-2xl border border-[#E2E8F0] bg-white p-3 shadow-[0_18px_50px_rgba(10,20,40,0.18)] outline-none',
          desktop
            ? 'fixed z-[70] w-[min(22.5rem,calc(100vw-1rem))]'
            : 'relative z-[1] w-full max-w-[22.5rem]',
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="m-0 text-[0.72rem] font-bold uppercase tracking-wider text-[#C2410C]">
            {panel === 'days' ? 'Choose a date' : 'Choose a time'}
          </p>
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[#1A1A2E] hover:bg-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
            aria-label="Close calendar"
            onClick={() => close(true)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <p id={descriptionId} className="sr-only">
          Only days with an open appointment can be selected. Times are Central, one hour each.
        </p>

        {panel === 'days' ? (
          <div>
            <div className="mb-2 grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-1">
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-xl text-[#1A1A2E] hover:bg-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Previous month"
                disabled={atMin}
                onClick={() => goMonth(-1)}
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <h3 id={titleId} className="m-0 truncate text-center text-[1rem] font-extrabold text-[#1A1A2E]" aria-live="polite">
                {monthTitle(visible)}
              </h3>
              <button
                type="button"
                className="flex h-11 w-11 items-center justify-center rounded-xl text-[#1A1A2E] hover:bg-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] disabled:cursor-not-allowed disabled:opacity-30"
                aria-label="Next month"
                disabled={atMax}
                onClick={() => goMonth(1)}
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>

            <div role="grid" aria-labelledby={titleId} onKeyDown={onGridKeyDown}>
              <div role="row" className="grid grid-cols-7">
                {WEEKDAY_SHORT.map((label, index) => (
                  <div
                    key={label}
                    role="columnheader"
                    className="flex h-8 items-center justify-center text-[0.68rem] font-bold uppercase tracking-wide text-[#64748B]"
                  >
                    <abbr title={WEEKDAY_LONG[index]} className="no-underline">{label}</abbr>
                  </div>
                ))}
              </div>
              {weeks.map((week) => (
                <div key={week[0].key} role="row" className="grid grid-cols-7">
                  {week.map((cell) => {
                    if (!cell.inMonth) {
                      return (
                        <span key={cell.key} role="presentation" className="h-11" />
                      );
                    }
                    const available = byDay.has(cell.key);
                    const chosen = selectedKey === cell.key;
                    const label = formatCivilDate(cell.key);
                    return (
                      <button
                        key={cell.key}
                        type="button"
                        role="gridcell"
                        ref={(node) => {
                          if (node && cell.key === cursor) cursorRef.current = node;
                        }}
                        tabIndex={cell.key === cursor ? 0 : -1}
                        aria-selected={chosen}
                        aria-disabled={!available}
                        aria-label={available ? `${label}, ${byDay.get(cell.key)!.length} open ${byDay.get(cell.key)!.length === 1 ? 'time' : 'times'}` : `${label}, unavailable`}
                        data-testid={`slot-day-${cell.key}`}
                        onFocus={() => {
                          if (cell.key !== cursor) setCursor(cell.key);
                        }}
                        onClick={() => chooseDay(cell.key)}
                        className={cn(
                          'relative flex h-11 min-w-0 items-center justify-center rounded-xl text-[0.92rem] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-1',
                          available && !chosen && 'text-[#1A1A2E] hover:bg-[#FFF5EC]',
                          !available && 'cursor-not-allowed text-[#C5CDD6]',
                          chosen && 'bg-[#1A1A2E] text-white',
                        )}
                      >
                        {cell.day}
                        {available && (
                          <span className={cn('absolute bottom-1 h-1 w-1 rounded-full', chosen ? 'bg-white' : 'bg-[#FF6B00]')} />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div>
            <button
              type="button"
              className="mb-2 inline-flex h-11 items-center gap-1 rounded-xl px-2 text-[0.88rem] font-bold text-[#1A1A2E] hover:bg-[#F1F5F9] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00]"
              onClick={() => {
                pendingFocus.current = true;
                setPanel('days');
              }}
            >
              <ChevronLeft className="h-4 w-4" />
              All dates
            </button>
            <h3
              ref={dayHeadingRef}
              id={titleId}
              tabIndex={-1}
              className="m-0 text-[1.05rem] font-extrabold text-[#1A1A2E] outline-none"
            >
              {daySlots[0] ? formatDay(daySlots[0].start) : formatCivilDate(cursor)}
            </h3>
            <p className="mb-3 mt-1 text-[0.8rem] text-[#64748B]">1-hour times · Central</p>
            <div className="grid grid-cols-3 gap-2" role="listbox" aria-label="Open times">
              {daySlots.map((slot) => {
                const chosen = value?.start === slot.start;
                return (
                  <button
                    key={slot.start}
                    type="button"
                    role="option"
                    aria-selected={chosen}
                    data-testid={`slot-time-${slot.start}`}
                    onClick={() => chooseTime(slot)}
                    className={cn(
                      'min-h-11 min-w-0 rounded-xl border text-[0.92rem] font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-1',
                      chosen
                        ? 'border-[#FF6B00] bg-[#FF6B00] text-white'
                        : 'border-[#E2E8F0] bg-white text-[#1A1A2E] hover:border-[#FF6B00] hover:bg-[#FFF8F3]',
                    )}
                  >
                    {formatTime(slot.start)}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  ) : null;

  return (
    <div className="min-w-0">
      <button
        ref={triggerRef}
        type="button"
        data-testid="slot-picker-trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? dialogId : undefined}
        onClick={() => (open ? close(false) : openPicker())}
        className={cn(
          'mt-4 flex w-full min-w-0 items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF6B00] focus-visible:ring-offset-2',
          value ? 'border-[#FF6B00] bg-[#FFF8F3]' : 'border-[#D6DCE5] bg-white hover:border-[#FF6B00]',
        )}
      >
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#FFF5EC] text-[#FF6B00]">
          <CalendarDays className="h-5 w-5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          {value ? (
            <>
              <span className="block truncate font-bold text-[#1A1A2E]">{formatDay(value.start)}</span>
              <span className="block truncate text-[0.9rem] font-semibold text-[#9A3412]">
                {formatTime(value.start)} – {formatTime(value.end)} Central
              </span>
            </>
          ) : (
            <>
              <span className="block font-bold text-[#1A1A2E]">Pick a date & time</span>
              <span className="block text-[0.86rem] text-[#64748B]">Open times only · Central time</span>
            </>
          )}
        </span>
        <span className="shrink-0 text-[0.84rem] font-bold text-[#C2410C]">{value ? 'Change' : 'Choose'}</span>
      </button>
      <p className="m-0 mt-3 text-[0.8rem] leading-relaxed text-[#64748B]">
        One hour. The calendar only lists times that are still open.
      </p>
      {dialog && typeof document !== 'undefined' ? createPortal(dialog, document.body) : null}
    </div>
  );
});
