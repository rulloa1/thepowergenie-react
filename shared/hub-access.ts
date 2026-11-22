export function powerGenieEmail(value: string): boolean {
  const email = value.trim().toLowerCase();
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.includes('powergenie');
}
