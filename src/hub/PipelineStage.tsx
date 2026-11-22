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
  const known = at >= 0;
  const total = PIPELINE_STEPS.length;
  const label = lost ? 'Lost' : stageLabel(stage || 'bill_received');
  const next = !lost && known && at < total - 1 ? stageLabel(PIPELINE_STEPS[at + 1]) : null;
  return (
    <div className="mt-2.5" data-testid="pipeline-bar">
      <p className="m-0 flex flex-wrap items-baseline gap-x-2 text-[0.82rem]">
        <span className="font-bold uppercase tracking-wide text-hub-soft">Pipeline</span>
        <span className={cn('text-[0.95rem] font-bold', lost ? 'text-hub-soft' : 'text-hub-ink')}>
          {lost ? 'Lost' : known ? `Step ${at + 1} of ${total}: ${label}` : label}
        </span>
        {next && <span className="text-hub-soft">Next: {next}</span>}
      </p>
      <ol className="m-0 mt-1.5 flex list-none gap-1 p-0" aria-label={lost ? 'Pipeline: lost' : known ? `Pipeline: ${label}, step ${at + 1} of ${total}` : `Pipeline: ${label}`}>
        {PIPELINE_STEPS.map((step, index) => (
          <li
            key={step}
            title={stageLabel(step)}
            aria-current={!lost && known && index === at ? 'step' : undefined}
            className={cn(
              'h-2 flex-1 rounded-full',
              lost || !known ? 'bg-hub-muted'
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
  return (
    <div className="mt-5 max-w-sm" aria-label="Pipeline">
      <label htmlFor="customer-stage-filter" className="mb-1.5 block text-base font-semibold text-hub-ink">Show</label>
      <select
        id="customer-stage-filter"
        value={selected ?? ''}
        onChange={(event) => onSelect(event.target.value || null)}
        className="min-h-12 w-full rounded-xl border border-hub-control bg-hub-surface px-3 text-base text-hub-ink"
      >
        <option value="">{`All customers (${total})`}</option>
        {PIPELINE_STEPS.map((step) => (
          <option key={step} value={step}>{`${stageLabel(step)} (${counts.get(step) || 0})`}</option>
        ))}
        {lost > 0 && <option value="lost">{`Lost (${lost})`}</option>}
      </select>
    </div>
  );
}
