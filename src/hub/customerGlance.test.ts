import { describe, expect, it } from 'vitest';
import { dueText, nextPipelineStep, savingsText } from './customerGlance';
import { stageLabel } from './leadRecord';
import { hubNavFor } from './hubNav';
import { classifyConferenceProblem, conferenceProblemCopy } from './conferenceSetup';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { ConferenceRoomButton } from './ConferenceRoomButton';

describe('customer list glance', () => {
  it('shows plain stage names and the next step', () => {
    expect(stageLabel('proposal_ready')).toBe('Proposal ready');
    expect(stageLabel('savings_calc')).toBe('Savings estimate');
    expect(nextPipelineStep('proposal_ready')).toBe('Presented');
    expect(nextPipelineStep('installed')).toBe('No next step');
    expect(nextPipelineStep('lost')).toBe('No next step');
  });

  it('formats a savings estimate and a due date', () => {
    expect(savingsText(null)).toBe('Not estimated yet');
    expect(savingsText(186)).toBe('$186 a month');
    expect(dueText(null, null).text).toBe('No date yet');
    expect(dueText('2020-01-01T00:00:00.000Z', null, Date.parse('2026-01-01T00:00:00.000Z')).overdue).toBe(true);
  });
});

describe('conference room is available to both hub roles', () => {
  it('keeps Conference room in the nav for the owner and the admin', () => {
    for (const role of ['owner', 'admin'] as const) {
      expect(hubNavFor(role).map((item) => item.label)).toContain('Conference room');
    }
    expect(hubNavFor('owner')).toEqual(hubNavFor('admin'));
  });

  it('renders a labeled Conference room button with no role check', () => {
    const html = renderToStaticMarkup(React.createElement(ConferenceRoomButton, { onClick: () => {} }));
    expect(html).toContain('Conference room');
    expect(html).toContain('data-conference-room');
  });

  it('tells a placeholder database key apart from missing LiveKit keys', () => {
    expect(classifyConferenceProblem({
      configured: false,
      problem: 'database_key',
      error: 'Scheduling is not configured yet. Please call Horace and we will set this up.',
    })).toBe('database_key');
    expect(conferenceProblemCopy('database_key', 'Scheduling is not configured yet.').title).toBe('Database key is not ready');
    expect(conferenceProblemCopy('database_key', 'Scheduling is not configured yet.').body).toMatch(/not a LiveKit key/);
    expect(conferenceProblemCopy('database_key', 'Scheduling is not configured yet.').body).toMatch(/not a LiveKit key/);
    expect(classifyConferenceProblem({ configured: false, problem: 'livekit' })).toBe('livekit');
    expect(conferenceProblemCopy('livekit', null).title).toBe('LiveKit is not ready');
    expect(conferenceProblemCopy('livekit', null).body).toMatch(/LIVEKIT_API_KEY/);
    expect(classifyConferenceProblem({ configured: true })).toBeNull();
  });
});
