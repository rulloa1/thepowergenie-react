import { PIPELINE_STEPS, pipelineStep } from './PipelineStage';
import { stageLabel } from './leadRecord';
import { formatDateTime } from './time';
import { dueLabel, money } from './workflowApi';

/** Plain next step from the sale stages. A real task title replaces this when one is open. */
export function nextPipelineStep(stage: string | null | undefined): string {
  if (stage === 'lost') return 'No next step';
  const at = pipelineStep(stage || 'bill_received');
  if (at < 0 || at >= PIPELINE_STEPS.length - 1) return 'No next step';
  return stageLabel(PIPELINE_STEPS[at + 1]);
}

export function savingsText(monthly: number | null | undefined): string {
  if (monthly == null || !Number.isFinite(monthly)) return 'Not estimated yet';
  return `${money(monthly)} a month`;
}

export function dueText(taskDue: string | null | undefined, appointment: string | null | undefined, now = Date.now()): { text: string; overdue: boolean } {
  if (taskDue) return dueLabel(taskDue, now);
  if (!appointment) return { text: 'No date yet', overdue: false };
  const at = Date.parse(appointment);
  if (!Number.isFinite(at)) return { text: appointment, overdue: false };
  return { text: formatDateTime(appointment), overdue: at < now };
}
