export function ownerEmailLabel(status?: string | null) {
  switch (status) {
    case 'accepted': return 'Accepted by email provider';
    case 'failed': return 'Send failed';
    case 'unconfigured': return 'Email setup needed';
    default: return 'No send recorded';
  }
}
