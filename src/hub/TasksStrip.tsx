import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ClipboardList, Settings2 } from 'lucide-react';
import { Button, Notice, cn } from './ui';
import { WORKFLOW_CHANGED, announceWorkflowChange, dueLabel, workflowApi, type WorkflowTask } from './workflowApi';

const SHOWN = 6;

export default function TasksStrip({ onOpenLead, onOpenPricing }: { onOpenLead: (leadId: string) => void; onOpenPricing: () => void }) {
  const [tasks, setTasks] = useState<WorkflowTask[] | null>(null);
  const [rateReady, setRateReady] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [all, setAll] = useState(false);

  const load = useCallback(() => {
    workflowApi.tasks()
      .then((result) => { setTasks(result.tasks); setRateReady(result.rateReady); setError(null); })
      .catch((reason: Error & { status?: number }) => setError(reason.status === 503 ? null : reason.message));
  }, []);

  useEffect(() => {
    load();
    const onChange = () => load();
    window.addEventListener(WORKFLOW_CHANGED, onChange);
    const timer = window.setInterval(load, 120_000);
    return () => { window.removeEventListener(WORKFLOW_CHANGED, onChange); window.clearInterval(timer); };
  }, [load]);

  const finish = async (task: WorkflowTask) => {
    setBusy(task.id);
    try {
      await workflowApi.task(task.id, true);
      announceWorkflowChange(task.lead_id);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not update that task.');
    } finally {
      setBusy(null);
    }
  };

  if (tasks === null && !error) return null;
  const list = tasks || [];
  const shown = all ? list : list.slice(0, SHOWN);

  return (
    <div className="mt-4 grid gap-3">
      {!rateReady && (
        <Notice tone="warn" title="Set your Sunrun rate to start building proposals">
          <span className="block">Savings and proposals wait for the plan rate and its yearly increase.</span>
          <Button type="button" variant="ghost" className="mt-2 min-h-[38px] px-3 text-[0.84rem]" onClick={onOpenPricing}>
            <Settings2 className="h-3.5 w-3.5" /> Set pricing
          </Button>
        </Notice>
      )}
      {error && <Notice tone="error">{error}</Notice>}
      <div className="rounded-2xl border border-hub-line bg-hub-surface p-3.5">
        <div className="flex items-center justify-between gap-2">
          <p className="m-0 flex items-center gap-2 text-[0.95rem] font-bold text-hub-ink">
            <ClipboardList className="h-4 w-4 text-hub-accent-ink" aria-hidden="true" /> Tasks
            <span className="rounded-full bg-hub-muted px-2 py-0.5 text-[0.72rem] font-semibold text-hub-soft">{list.length}</span>
          </p>
          {list.length > SHOWN && (
            <button type="button" className="text-[0.82rem] font-semibold text-hub-link hover:underline" onClick={() => setAll(!all)}>
              {all ? 'Show fewer' : `Show all ${list.length}`}
            </button>
          )}
        </div>
        {list.length === 0 ? (
          <p className="m-0 mt-2 text-[0.88rem] text-hub-soft">Nothing due. New tasks appear here as leads move through the sale.</p>
        ) : (
          <ul className="m-0 mt-2 grid list-none gap-1.5 p-0">
            {shown.map((task) => {
              const due = dueLabel(task.due_at);
              return (
                <li key={task.id} className="flex items-start gap-2.5 rounded-xl px-1 py-1.5">
                  <button
                    type="button"
                    aria-label={`Mark done: ${task.title}`}
                    disabled={busy === task.id}
                    onClick={() => void finish(task)}
                    className="mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-hub-control text-hub-soft hover:border-hub-success-line hover:text-hub-success-ink disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                  </button>
                  <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpenLead(task.lead_id)}>
                    <span className="block text-[0.9rem] font-semibold leading-snug text-hub-ink">{task.title}</span>
                    <span className="block text-[0.78rem] text-hub-soft">
                      {task.leadName}
                      {due.text && <span className={cn('ml-1.5 font-semibold', due.overdue ? 'text-hub-danger' : 'text-hub-soft')}>· {due.text}</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
