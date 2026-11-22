import { useEffect, useState } from 'react';
import { conferenceApi } from './conferenceApi';
import { centralDateKey, formatShortDay, formatTime } from './time';
import type { Lead, LeadFeed } from './useLeadFeed';
import { Button } from './ui';
import { WORKFLOW_CHANGED, type WorkflowTask } from './workflowApi';

function PreCallBrief({ lead, sample }: { lead: Lead; sample: boolean }) {
  const [proposal, setProposal] = useState('Checking…');
  const [lastCall, setLastCall] = useState('');
  useEffect(() => {
    if (sample || lead.source !== 'customer') return;
    let alive = true;
    let revision = 0;
    const load = () => {
      const request = ++revision;
      conferenceApi.brief(lead.id).then(result => {
        if (!alive || request !== revision) return;
        setProposal(result.proposal === 'approved' || result.proposal === 'sent' ? 'Ready to review' : result.proposal === 'draft' ? 'Draft · needs approval' : 'No proposal on file');
        setLastCall(result.lastCall ? [result.lastCall.title, result.lastCall.detail].filter(Boolean).join(' · ') : '');
      }).catch(() => { if (alive && request === revision) setProposal('Could not load proposal status'); });
    };
    load();
    window.addEventListener(WORKFLOW_CHANGED, load);
    return () => { alive = false; window.removeEventListener(WORKFLOW_CHANGED, load); };
  }, [lead.id, lead.source, sample]);
  return <dl className="today-brief">
    <div><dt>Utility bill</dt><dd>{lead.bill ? 'On file' : 'Ask for a recent bill'}</dd></div>
    <div><dt>Proposal</dt><dd>{sample ? 'Sample record' : lead.source === 'booking' ? 'Check customer record' : proposal}</dd></div>
    <div><dt>{lastCall ? 'Last call' : 'Customer note'}</dt><dd>{lastCall || lead.notes || 'No note on file'}</dd></div>
  </dl>;
}

export default function TodayAgenda({ feed, tasks, tasksReady, openLead, openRoom }: {
  feed: LeadFeed; tasks: WorkflowTask[]; tasksReady: boolean; openLead: (id: string) => void; openRoom: (lead: Lead) => void;
}) {
  const [now, setNow] = useState(() => new Date());
  const [selected, setSelected] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 60000);
    return () => window.clearInterval(timer);
  }, []);
  const day = centralDateKey(now);
  const entries = feed.leads.filter(lead => {
    if (lead.archived || lead.cancelled || !lead.appointment) return false;
    const time = lead.appointment;
    if (time.length === 10) return time === day;
    return Number.isFinite(Date.parse(time)) && centralDateKey(time) === day;
  }).sort((a,b) => Date.parse(a.appointment!) - Date.parse(b.appointment!));
  const upcoming = entries.find(lead => Date.parse(lead.appointment!) >= now.getTime());
  const current = entries.find(lead => lead.id === selected) || upcoming || entries.at(-1);
  const overdue = tasks.filter(task => !task.done_at && !task.cancelled_at && Date.parse(task.due_at) < now.getTime());
  return <section className="today-agenda" aria-labelledby="today-title">
    <div className="today-title"><h3 id="today-title">Today</h3><span>{formatShortDay(now)} · Central</span></div>
    {feed.loading ? <p>Loading appointments…</p> : feed.error ? <p>Appointments unavailable.</p> : current ? <>
      <div className="today-meeting">
        <div><small>{current === upcoming ? 'Next appointment' : 'Appointment'} · {current.appointment!.length === 10 ? 'Time to confirm' : formatTime(current.appointment!)}</small><h4>{current.name}</h4></div>
        <div className="flex flex-wrap gap-2">
          <Button variant="ghost" onClick={() => openLead(current.id)}>Open record</Button>
          {current.source === 'customer' && <Button onClick={() => openRoom(current)}>Open room</Button>}
        </div>
      </div>
      <PreCallBrief key={current.source + current.id} lead={current} sample={feed.sample} />
      {entries.length > 1 && <label className="today-picker">Today's appointments<select value={current.id} onChange={e => setSelected(e.target.value)}>
        {entries.map(entry => <option key={entry.source + entry.id} value={entry.id}>{entry.appointment!.length === 10 ? 'Time to confirm' : formatTime(entry.appointment!)} · {entry.name}</option>)}
      </select></label>}
    </> : <p>No appointments scheduled today.</p>}
    {overdue.length > 0 ? <details className="today-followups" open><summary>Overdue follow-ups ({overdue.length})</summary>
      {overdue.map(task => <button type="button" key={task.id} onClick={() => openLead(task.lead_id)}>{task.leadName} · {task.title}<span>{formatShortDay(task.due_at)}</span></button>)}
    </details> : <small>{tasksReady ? 'No overdue follow-ups.' : 'Follow-up status unavailable.'}</small>}
  </section>;
}
