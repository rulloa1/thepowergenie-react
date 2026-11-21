import { useState, type ReactNode } from 'react';
import { Phone, Play, X } from 'lucide-react';
import './ConferenceLobby.css';

const media = '/assets/conference';
const clips = [
  {
    id: 'solar-basics',
    title: 'How home solar works',
    transcript: [
      'Solar panels turn sunlight into electricity.',
      'An inverter converts that electricity into power your home can use.',
      'A battery, if included, can store extra energy for later.',
    ],
  },
  {
    id: 'consultation',
    title: 'What to expect today',
    transcript: [
      'Tell your host about your home and how you use electricity.',
      'Review your solar options and ask about costs, equipment, and timing.',
      'Ask questions and decide whether you want to take the next step.',
    ],
  },
] as const;

export default function ConferenceLobby({ children, statusError, leaving, onLeave }: {
  children: ReactNode;
  statusError: string | null;
  leaving: boolean;
  onLeave: () => void;
}) {
  const [clip, setClip] = useState<(typeof clips)[number] | null>(null);

  return (
    <main className="pg-lobby">
      <header className="pg-lobby-header">
        <div className="pg-lobby-brands">
          <img src="/assets/conference/sunrun-wordmark.webp" alt="Sunrun" />
          <span />
          <img src="/assets/brand/power-genie-lockup.webp" alt="Power Genie" />
        </div>
        <p>Conference room</p>
        <button className="pg-lobby-leave" type="button" disabled={leaving} onClick={onLeave}><Phone size={16} /> {leaving ? 'Leaving…' : 'Leave'}</button>
      </header>
      <div className="pg-lobby-layout">
        <section className="pg-lobby-stage" aria-label="Conference waiting room artwork">
          <img src={media + '/command-center.webp'} alt="" />
          <span className="pg-lobby-badge"><i /> Waiting for host</span>
          <div className="pg-lobby-name"><strong>Emilia Cruz</strong><span>Virtual assistant</span></div>
        </section>
        <aside className="pg-lobby-panel">
          <h1>Your host will join shortly</h1>
          <p role="status">{statusError ?? 'Keep this page open. You’ll join automatically when your host lets you in.'}</p>
          <h2>While you wait</h2>
          {clip ? (
            <div className="pg-lobby-player">
              <button autoFocus type="button" onClick={() => setClip(null)}><X size={16} /> Back to videos</button>
              <video key={clip.id} src={media + '/' + clip.id + '.mp4'} poster={media + '/' + clip.id + '.webp'} aria-label={clip.title} controls autoPlay playsInline preload="metadata" />
              <details>
                <summary>Read the transcript</summary>
                <ul>{clip.transcript.map(line => <li key={line}>{line}</li>)}</ul>
              </details>
            </div>
          ) : clips.map(item => (
            <button key={item.id} className="pg-lobby-clip" type="button" onClick={() => setClip(item)}>
              <img src={media + '/' + item.id + '.webp'} alt="" />
              <Play size={24} aria-hidden="true" />
              <strong>{item.title}</strong>
            </button>
          ))}
          <details className="pg-lobby-camera">
            <summary>Camera settings</summary>
            <div className="hub-canvas rounded-xl p-3 text-hub-ink">{children}</div>
          </details>
        </aside>
      </div>
    </main>
  );
}
