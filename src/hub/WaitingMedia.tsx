import { useState } from 'react';
import './conference.css';

const clips = [
  { title: 'Welcome to Power Genie · Sunrun', src: '/assets/brand/power-genie-animation.mp4', detail: 'Your host will welcome you into the room shortly.' },
  { title: 'Solar for your home', src: '/assets/vid/mobile/c01-sun-roof.mp4', detail: 'Your roof, sunlight, and energy needs help shape your solar proposal.' },
  { title: 'Battery storage', src: '/assets/vid/mobile/c03-battery-home.mp4', detail: 'Ask your advisor about battery options and which home circuits can be backed up.' },
];

export default function WaitingMedia() {
  const [selected, setSelected] = useState(0);
  const clip = clips[selected];
  return <section className="pg-waiting-media" aria-label="Sunrun waiting room"><strong>sunrun · The Power Genie</strong><label><span className="sr-only">Waiting room clip</span><select value={selected} onChange={(event) => setSelected(Number(event.target.value))}>{clips.map((item, index) => <option key={item.src} value={index}>{item.title}</option>)}</select></label><video key={clip.src} src={clip.src} poster="/assets/stills/06-cta.webp" muted playsInline controls loop preload="metadata" /><p>{clip.detail}</p></section>;
}
