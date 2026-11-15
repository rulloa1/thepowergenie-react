import { Video } from 'lucide-react';
import { Button, cn } from './ui';

/** Visible on every customer row and on the Conference room tab. Not gated by role. */
export function ConferenceRoomButton({
  onClick,
  className,
  size = 'default',
}: {
  onClick: () => void;
  className?: string;
  size?: 'default' | 'sm';
}) {
  return (
    <Button
      type="button"
      variant="accent"
      data-conference-room="true"
      className={cn(
        size === 'sm' ? 'min-h-[34px] px-2.5 text-xs font-semibold' : 'min-h-11 px-4 text-sm font-semibold',
        className,
      )}
      onClick={onClick}
    >
      <Video className={cn(size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4')} aria-hidden="true" /> Conference room
    </Button>
  );
}
