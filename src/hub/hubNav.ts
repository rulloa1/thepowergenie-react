import type { HubTab } from '../lib/siteRoutes';

export type HubNavItem = { id: HubTab; label: string };

/**
 * The signed-in desk uses the same tabs for Horace (owner) and Rory (admin).
 * Conference room is a top-level tab, not a role or sample-desk feature.
 */
export const HUB_NAV: readonly HubNavItem[] = [
  { id: 'leads', label: 'Customers' },
  { id: 'conference', label: 'Conference room' },
  { id: 'chat', label: 'Chat' },
  { id: 'schedule', label: 'Appointments' },
  { id: 'files', label: 'Files' },
];

export function hubNavFor(_role: 'owner' | 'admin' | string | null | undefined): readonly HubNavItem[] {
  return HUB_NAV;
}
