import { Video } from 'lucide-react';
import { Button, cn } from './ui';

/** Visible on every customer row and on the Conference room tab. Not gated by role. */
export function ConferenceRoomButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <Button
      type="button"
      variant="accent"
      data-conference-room="true"
      className={cn('min-h-12 px-4 text-base', className)}
      onClick={onClick}
    >
      <Video className="h-4 w-4" aria-hidden="true" /> Conference room
    </Button>
  );
}
