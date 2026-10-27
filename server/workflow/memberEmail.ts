import { HttpError } from '../http.js'
import { sendCustomEmail } from '../notify.js'
import { selectRows } from './db.js'
import { origin } from './engine.js'

type Member = { id: string; email: string; full_name: string | null; role: string }

export function signInEmail(member: { email: string; fullName: string | null }, dashboardUrl: string): { subject: string; body: string } {
  const first = (member.fullName || '').trim().split(/\s+/)[0] || 'there'
  return {
    subject: 'How to sign in to The Power Genie dashboard',
    body: [
      `Hi ${first},`,
      '',
      "Here's how to get into The Power Genie dashboard, where our solar leads, light bills, proposals, tasks and Smart Meter Texas info live.",
      '',
      `Dashboard: ${dashboardUrl}`,
      '',
      'To sign in:',
      '1. Open the link above on your phone or computer.',
      `2. Enter your email: ${member.email}`,
      '3. Tap "Email me a sign-in link", then open the link that arrives in your inbox. If you have set a password, you can type it instead.',
      '4. Forgot your password? Enter your email and tap "Forgot password" to set a new one.',
      '',
      'Your account is already set up.',
      '',
      "What's inside:",
      '- Tasks at the top of the Leads tab show what is due next on each lead.',
      '- Each lead has a Sales workflow section with the savings estimate, system size and a draft proposal. Tap Preview to check it, then Approve and send. Nothing goes to a customer until it is approved.',
      '- Pricing on the Leads tab holds the Sunrun rate the proposals use.',
      '',
      'Rory',
      'The Power Genie',
      '(281) 323-0450',
    ].join('\n'),
  }
}

/** Emails sign-in steps to existing dashboard members only. Never to anyone else. */
export async function emailSignInSteps(emails: unknown): Promise<{ sent: string[]; skipped: string[] }> {
  if (!Array.isArray(emails) || emails.length === 0 || emails.length > 10) throw new HttpError(400, 'List one to ten member emails.')
  const wanted = [...new Set(emails.filter((value): value is string => typeof value === 'string').map(value => value.trim().toLowerCase()))]
  const members = await selectRows<Member>('hub_profiles', {}, { select: 'id,email,full_name,role', limit: 100 })
  const byEmail = new Map(members.map(member => [member.email.toLowerCase(), member]))
  const dashboardUrl = `${origin()}/dashboard`
  const sent: string[] = []
  const skipped: string[] = []
  for (const email of wanted) {
    const member = byEmail.get(email)
    if (!member) {
      skipped.push(email)
      continue
    }
    const message = signInEmail({ email: member.email, fullName: member.full_name }, dashboardUrl)
    if (await sendCustomEmail(member.email, message.subject, message.body)) sent.push(member.email)
    else skipped.push(member.email)
  }
  return { sent, skipped }
}
