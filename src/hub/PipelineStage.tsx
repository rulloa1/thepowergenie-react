import { LEAD_STAGES, stageLabel } from './leadRecord';
import { cn } from './ui';

/** The nine steps of a sale, in order. "Lost" sits outside the line. */
export const PIPELINE_STEPS = LEAD_STAGES.map(([id]) => id).filter((id) => id !== 'lost');

export function pipelineStep(stage: string | null | undefined): number {
  return PIPELINE_STEPS.indexOf((stage || 'bill_received') as (typeof PIPELINE_STEPS)[number]);
}

/** Big, plain "where is this customer" line for a lead card. */
export function PipelineBar({ stage }: { stage: string | null }) {
  const lost = stage === 'lost';
  const at = pipelineStep(stage);
  const total = PIPELINE_STEPS.length;
  const label = lost ? 'Lost' : stageLabel(stage || 'bill_received');
  const next = !lost && at >= 0 && at < total - 1 ? stageLabel(PIPELINE_STEPS[at + 1]) : null;
  return (
    <div className="mt-2.5" data-testid="pipeline-bar">
      <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-[0.82rem]">
        <span className="font-bold uppercase tracking-wide text-hub-soft">Pipeline</span>
        <span className={cn('text-[0.95rem] font-bold', lost ? 'text-hub-soft' : 'text-hub-ink')}>
          {lost ? 'Lost' : `Step ${at + 1} of ${total}: ${label}`}
        </span>
        {next && <span className="text-hub-soft">Next: {next}</span>}
      </p>
      <ol className="m-0 mt-1.5 flex list-none gap-1 p-0" aria-label={lost ? 'Pipeline: lost' : `Pipeline: ${label}, step ${at + 1} of ${total}`}>
        {PIPELINE_STEPS.map((step, index) => (
          <li
            key={step}
            title={stageLabel(step)}
            aria-current={!lost && index === at ? 'step' : undefined}
            className={cn(
              'h-2 flex-1 rounded-full',
              lost ? 'bg-hub-muted'
                : index < at ? 'bg-hub-success-ink'
                  : index === at ? 'bg-hub-accent-fill'
                    : 'bg-hub-muted',
            )}
          >
            <span className="sr-only">{stageLabel(step)}{index < at && !lost ? ' (done)' : ''}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** Count of leads at each step; tapping one filters the list. */
export function PipelineSummary({
  stages,
  total,
  selected,
  onSelect,
}: {
  stages: Array<string | null>;
  /** Everything in the list, booking-page appointments included. */
  total: number;
  selected: string | null;
  onSelect: (stage: string | null) => void;
}) {
  const counts = new Map<string, number>();
  for (const stage of stages) {
    const key = stage || 'bill_received';
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const lost = counts.get('lost') || 0;
  const chip = (id: string | null, label: string, count: number) => (
    <button
      key={id ?? 'all'}
      type="button"
      aria-pressed={selected === id}
      onClick={() => onSelect(id)}
      className={cn(
        'flex min-h-[44px] shrink-0 flex-col items-start justify-center rounded-xl border px-3 py-1.5 text-left',
        selected === id ? 'border-hub-on-primary bg-hub-primary text-hub-on-primary' : 'border-hub-line bg-hub-surface text-hub-ink hover:bg-hub-muted',
        count === 0 && selected !== id && 'opacity-55',
      )}
    >
      <span className="text-[1.05rem] font-bold leading-none tabular-nums">{count}</span>
      <span className="mt-1 whitespace-nowrap text-[0.72rem] font-semibold">{label}</span>
    </button>
  );
  return (
    <div className="mt-4" aria-label="Pipeline">
      <p className="m-0 mb-1.5 text-[0.72rem] font-bold uppercase tracking-wide text-hub-soft">Pipeline · tap a step to filter</p>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {chip(null, 'All', total)}
        {PIPELINE_STEPS.map((step) => chip(step, stageLabel(step), counts.get(step) || 0))}
        {lost > 0 && chip('lost', 'Lost', lost)}
      </div>
    </div>
  );
}
