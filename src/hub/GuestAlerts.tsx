import { lazy, Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { conferenceApi, type ActiveRoom } from './conferenceApi';
import { Button } from './ui';

const Sheet = lazy(() => import('./ConferenceRoom').then(mod => ({ default: mod.ConferenceSheet })));

export default function GuestAlerts() {
  const [rooms, setRooms] = useState<ActiveRoom[]>([]);
  const [selected, setSelected] = useState<ActiveRoom | null>(null);
  useEffect(() => {
    let alive = true;
    let timer: number;
    async function check() {
      try {
        const result = await conferenceApi.rooms();
        if (alive) setRooms(result.rooms.filter(room => room.waiting));
      } catch { if (alive) setRooms([]); }
      if (alive) timer = window.setTimeout(check, 15000);
    }
    void check();
    return () => { alive = false; window.clearTimeout(timer); };
  }, []);
  return <>
    {rooms.map(room => <div className="today-alert" key={room.invitePath}>
      <span role="status">Guest waiting · {room.customerName}</span>
      <Button variant="ghost" onClick={() => setSelected(room)}>Open room</Button>
    </div>)}
    {selected && createPortal(<Suspense fallback={null}><Sheet customerId={selected.customerId} customerName={selected.customerName} initialInvitePath={selected.invitePath} sample={false} onClose={() => setSelected(null)} /></Suspense>, document.body)}
  </>;
}
