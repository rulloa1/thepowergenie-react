/**
 * What happens when a lead enters a stage: tasks for the team and
 * emails or texts for the customer. Pure data, so it is easy to read
 * and to test. The engine decides when a stage is entered.
 */

export type MessageContext = {
  firstName: string
  advisorName: string
  advisorPhone: string
  origin: string
  proposalUrl: string | null
  unsubscribeUrl: string
}

export type TaskPlan = {
  kind: string
  title: string
  detail: string
  dueHours: number
  /** Finishing this task moves the lead to this stage. */
  advancesTo?: string
}

export type FollowupPlan = {
  key: string
  channel: 'email' | 'sms'
  delayHours: number
  subject: string | null
  body: string
  /** Only sent while the lead still has no usage (bill or Smart Meter Texas). */
  onlyWithoutUsage?: boolean
}

function emailFooter(ctx: MessageContext): string {
  return [
    '',
    `Questions? Call or text ${ctx.advisorName} at ${ctx.advisorPhone}.`,
    '',
    'The Power Genie',
    '',
    `Stop these emails: ${ctx.unsubscribeUrl}`,
  ].join('\n')
}

function sms(textValue: string): string {
  return `${textValue} Reply STOP to opt out.`
}

export function tasksForStage(stage: string, ctx: { firstName: string }, hasUsage: boolean): TaskPlan[] {
  const name = ctx.firstName
  switch (stage) {
    case 'bill_received':
      return hasUsage
        ? []
        : [{
            kind: 'get_bill',
            title: `Get ${name}'s light bill`,
            detail: 'No usage yet. The customer was sent the bill upload and Smart Meter Texas steps. The proposal builds itself once a bill or usage is in.',
            dueHours: 24,
          }]
    case 'proposal_ready':
      return [{
        kind: 'approve_proposal',
        title: `Review and approve ${name}'s proposal`,
        detail: 'Check the numbers and the roof layout, adjust if needed, then approve to send it.',
        dueHours: 24,
      }]
    case 'presented':
      return [{
        kind: 'call_after_proposal',
        title: `Call ${name} about the proposal`,
        detail: 'Walk through the numbers and answer questions. Mark the lead Signed once the Sunrun agreement is signed.',
        dueHours: 48,
      }]
    case 'signed':
      return [{
        kind: 'schedule_survey',
        title: `Schedule ${name}'s site survey`,
        detail: 'Finishing this moves the lead to Site survey.',
        dueHours: 48,
        advancesTo: 'site_survey',
      }]
    case 'site_survey':
      return [{
        kind: 'submit_permits',
        title: `Submit permits for ${name}`,
        detail: 'Finishing this moves the lead to Permits.',
        dueHours: 24 * 7,
        advancesTo: 'permits',
      }]
    case 'permits':
      return [
        {
          kind: 'schedule_install',
          title: `Schedule ${name}'s install`,
          detail: 'Book the install date once permits are approved.',
          dueHours: 24 * 14,
        },
        {
          kind: 'confirm_install',
          title: `Mark ${name}'s install complete`,
          detail: 'Finishing this moves the lead to Installed.',
          dueHours: 24 * 30,
          advancesTo: 'installed',
        },
      ]
    case 'installed':
      return [{
        kind: 'ask_review',
        title: `Ask ${name} for a review and referrals`,
        detail: 'A happy customer is the best source of the next lead.',
        dueHours: 24 * 7,
      }]
    default:
      return []
  }
}

export function followupsForStage(stage: string, ctx: MessageContext, smsAllowed: boolean): FollowupPlan[] {
  const name = ctx.firstName
  const billLink = `${ctx.origin}/#bill`
  const plans: FollowupPlan[] = []
  switch (stage) {
    case 'bill_received':
      plans.push({
        key: 'bill_received:steps',
        channel: 'email',
        delayHours: 0.25,
        subject: `${name}, 2 quick steps for your solar savings`,
        body: [
          `Hi ${name},`,
          '',
          'Thanks for your interest in solar. Two quick steps let us build your savings estimate from your real usage:',
          '',
          `1. Upload a recent electric bill (a phone photo is fine): ${billLink}`,
          '2. Connect your Smart Meter Texas usage on that same page, then approve the email Smart Meter Texas sends you.',
          '',
          'Each takes about two minutes.',
          emailFooter(ctx),
        ].join('\n'),
        onlyWithoutUsage: true,
      })
      if (smsAllowed) {
        plans.push({
          key: 'bill_received:sms',
          channel: 'sms',
          delayHours: 24,
          subject: null,
          body: sms(`Hi ${name}, it's The Power Genie. To finish your solar savings estimate, upload a photo of your electric bill here: ${billLink}`),
          onlyWithoutUsage: true,
        })
      }
      plans.push({
        key: 'bill_received:reminder',
        channel: 'email',
        delayHours: 72,
        subject: `Still want your solar savings estimate, ${name}?`,
        body: [
          `Hi ${name},`,
          '',
          `We're holding your spot. Upload a recent electric bill and ${ctx.advisorName} will build your numbers: ${billLink}`,
          emailFooter(ctx),
        ].join('\n'),
        onlyWithoutUsage: true,
      })
      return plans
    case 'presented':
      plans.push({
        key: 'presented:check_in',
        channel: 'email',
        delayHours: 48,
        subject: `Any questions about your solar proposal, ${name}?`,
        body: [
          `Hi ${name},`,
          '',
          `Checking in on the solar proposal ${ctx.advisorName} sent. You can look at it again any time:`,
          ctx.proposalUrl || ctx.origin,
          '',
          `If anything is unclear, or you'd like to change the system size, just reply or call.`,
          emailFooter(ctx),
        ].join('\n'),
      })
      plans.push(
        smsAllowed
          ? {
              key: 'presented:nudge',
              channel: 'sms',
              delayHours: 120,
              subject: null,
              body: sms(`Hi ${name}, ${ctx.advisorName} here. Any questions on your solar proposal? ${ctx.proposalUrl || ctx.origin}`),
            }
          : {
              key: 'presented:nudge',
              channel: 'email',
              delayHours: 120,
              subject: `Your solar proposal is still here, ${name}`,
              body: [
                `Hi ${name},`,
                '',
                `Your proposal is ready whenever you are: ${ctx.proposalUrl || ctx.origin}`,
                '',
                `Tap "I'm interested" on the page and ${ctx.advisorName} will call you.`,
                emailFooter(ctx),
              ].join('\n'),
            },
      )
      return plans
    case 'signed':
      plans.push({
        key: 'signed:welcome',
        channel: 'email',
        delayHours: 1,
        subject: `Welcome to solar, ${name}. Here's what happens next`,
        body: [
          `Hi ${name},`,
          '',
          'Congratulations on going solar. Here is what happens from here:',
          '',
          '1. Site survey: a technician checks your roof and electrical panel.',
          '2. Permits: the city and your utility approve the design.',
          '3. Install: usually one to two days on site.',
          '4. Power on: your system turns on after the final inspection.',
          '',
          `${ctx.advisorName} will reach out to schedule the site survey.`,
          emailFooter(ctx),
        ].join('\n'),
      })
      return plans
    case 'site_survey':
      plans.push({
        key: 'site_survey:next',
        channel: 'email',
        delayHours: 1,
        subject: `Next up: your site survey, ${name}`,
        body: [
          `Hi ${name},`,
          '',
          `Your project is moving. ${ctx.advisorName} will confirm the site survey date and time with you. After the survey, permits are next.`,
          emailFooter(ctx),
        ].join('\n'),
      })
      return plans
    case 'permits':
      plans.push({
        key: 'permits:update',
        channel: 'email',
        delayHours: 1,
        subject: `Update: your solar permits, ${name}`,
        body: [
          `Hi ${name},`,
          '',
          'Your design is with the city and your utility for approval. Once permits are approved we will schedule your install.',
          emailFooter(ctx),
        ].join('\n'),
      })
      return plans
    case 'installed':
      plans.push({
        key: 'installed:congrats',
        channel: 'email',
        delayHours: 2,
        subject: `You're solar powered, ${name}!`,
        body: [
          `Hi ${name},`,
          '',
          'Congratulations, your system is installed. Thank you for trusting us with your home.',
          emailFooter(ctx),
        ].join('\n'),
      })
      plans.push({
        key: 'installed:referral',
        channel: 'email',
        delayHours: 24 * 14,
        subject: `Know someone tired of high electric bills, ${name}?`,
        body: [
          `Hi ${name},`,
          '',
          `If a friend or neighbor would like their own solar savings estimate, send them to ${ctx.origin} or have them call ${ctx.advisorName} at ${ctx.advisorPhone}.`,
          emailFooter(ctx),
        ].join('\n'),
      })
      return plans
    default:
      return plans
  }
}

/** Email that carries an approved proposal to the customer. */
export function proposalMessages(ctx: MessageContext & { savingsMonthly: number; systemKw: number }, smsAllowed: boolean): FollowupPlan[] {
  const name = ctx.firstName
  const saving = ctx.savingsMonthly > 0 ? ` It shows an estimated $${Math.round(ctx.savingsMonthly)} a month in savings in year one.` : ''
  const plans: FollowupPlan[] = [{
    key: 'proposal:sent',
    channel: 'email',
    delayHours: 0,
    subject: `${name}, your solar proposal is ready`,
    body: [
      `Hi ${name},`,
      '',
      `${ctx.advisorName} prepared your solar proposal: a ${ctx.systemKw} kW system designed for your home.${saving}`,
      '',
      `See your proposal: ${ctx.proposalUrl}`,
      '',
      `If it looks good, tap "I'm interested" on the page and ${ctx.advisorName} will call you to go over the next steps.`,
      emailFooter(ctx),
    ].join('\n'),
  }]
  if (smsAllowed) {
    plans.push({
      key: 'proposal:sent',
      channel: 'sms',
      delayHours: 0,
      subject: null,
      body: sms(`Hi ${name}, ${ctx.advisorName} here. Your solar proposal is ready: ${ctx.proposalUrl}`),
    })
  }
  return plans
}
