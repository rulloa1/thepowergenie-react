export function dashboardLoginEmail(value: string): string {
  const login = value.trim().toLowerCase();
  return login === 'thepowergenie' ? 'powergeniesunrun@gmail.com' : login;
}
