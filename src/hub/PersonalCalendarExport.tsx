import { privateCalendar } from '../../shared/private-calendar';
import { Button } from './ui';

export default function PersonalCalendarExport({ periods }: { periods: { start: string; end: string }[] }) {
  const download = () => {
    const url = URL.createObjectURL(new Blob([privateCalendar(periods)], { type: 'text/calendar;charset=utf-8' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'availability.ics';
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="rounded-3xl border border-hub-line bg-hub-surface p-5" aria-label="Personal calendar transfer"><h2 className="m-0 text-lg font-bold">Keep your personal calendar up to date</h2><p className="my-3 text-sm leading-relaxed text-hub-soft">Download appointment times as “Busy” blocks for a personal Google, Outlook, or Apple calendar. Customer names, addresses, notes, and meeting links are excluded.</p><Button type="button" variant="ghost" disabled={!periods.length} onClick={download}>Download busy times (.ics)</Button><p className="mb-0 mt-3 text-xs leading-relaxed text-hub-soft">This is a manual import, not automatic sync. Use a personal calendar you control. Work-managed accounts and devices may log activity.</p></section>;
}
