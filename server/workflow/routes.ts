import { createHash, timingSafeEqual } from 'node:crypto'
import { assertSameOrigin, clientIp, HttpError, isRecord, json, readWebJson } from '../http.js'
import { requireHubMember, type HubMember } from '../hub-member.js'
import { enforceRateLimit } from '../rate-limit.js'
import { deleteRows, patchRows, selectOne } from './db.js'
import {
  approveProposal,
  cancelFollowup,
  completeTask,
  leadDetail,
  loadSettings,
  markProposalShared,
  glanceLeadIds,
  openTasks,
  savingsGlance,
  recordInterest,
  recordView,
  reopenTask,
  runLead,
  saveOverrides,
  saveSettings,
  tick,
  unsubscribe,
  type Actor,
  type ProposalRow,
} from './engine.js'
import { fetchRoofImage, googleKey } from './google.js'
import { renderMessagePage, renderProposalHtml } from './proposalHtml.js'
import { emailSignInSteps } from './memberEmail.js'

const TEN_MINUTES = 10 * 60 * 1000
const PUBLIC_TOKEN = /^[0-9a-f]{48}$/
const ID = /^[A-Za-z0-9_-]{1,80}$/

function actorOf(member: HubMember): Actor {
  return { id: member.id, name: member.fullName || member.email || 'Dashboard member' }
}

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
      'x-robots-tag': 'noindex, nofollow',
      'referrer-policy': 'no-referrer',
      'content-security-policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'self'",
    },
  })
}

function secretEqual(provided: string, expected: string): boolean {
  if (!provided || !expected) return false
  const left = createHash('sha256').update(provided).digest()
  const right = createHash('sha256').update(expected).digest()
  return timingSafeEqual(left, right)
}

function cronAuthorized(request: Request): boolean {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim()
  return secretEqual(token, (process.env.WORKFLOW_CRON_SECRET || '').trim()) || secretEqual(token, (process.env.CRON_SECRET || '').trim())
}

function idFrom(value: unknown, label: string): string {
  if (typeof value !== 'string' || !ID.test(value)) throw new HttpError(400, `Missing ${label}.`)
  return value
}

async function proposalByToken(token: string | null): Promise<ProposalRow | null> {
  if (!token || !PUBLIC_TOKEN.test(token)) return null
  return selectOne<ProposalRow>('hub_proposals', { public_token: `eq.${token}` })
}

/** Relative on the customer's page (same origin, allowed by its CSP); absolute for the dashboard preview frame. */
function imageUrl(token: string, base = ''): string {
  return `${base}/api/assistant?route=workflow&action=roof&t=${token}`
}

/** /api/assistant?route=workflow&action=… */
export async function handleWorkflow(request: Request, url: URL): Promise<Response> {
  const action = url.searchParams.get('action') || ''

  if (action === 'unsubscribe' && request.method === 'GET') {
    enforceRateLimit(`wf-unsub:${clientIp(request)}`, 20, TEN_MINUTES)
    const done = await unsubscribe(url.searchParams.get('t') || '')
    return html(done
      ? renderMessagePage("You're unsubscribed", 'You will not get more emails or texts about your solar estimate. If you change your mind, just call or text us.')
      : renderMessagePage('Link not recognized', 'That unsubscribe link is not valid. Reply STOP to any text, or reply to any email, and we will remove you.'))
  }

  if (action === 'roof' && request.method === 'GET') {
    enforceRateLimit(`wf-roof:${clientIp(request)}`, 60, TEN_MINUTES)
    const proposal = await proposalByToken(url.searchParams.get('t'))
    const roof = proposal?.snapshot?.roof
    if (!proposal || proposal.status === 'superseded' || !roof?.center || !roof.zoom) return new Response('Not found', { status: 404 })
    const image = await fetchRoofImage(roof.center, roof.zoom)
    if (!image) return new Response('Not available', { status: 404 })
    return new Response(image.bytes, { headers: { 'content-type': image.type, 'cache-control': 'private, max-age=3600' } })
  }

  if (action === 'tick' && request.method === 'POST') {
    if (!cronAuthorized(request)) throw new HttpError(401, 'Unauthorized.')
    return json({ ok: true, ...(await tick()) })
  }

  if (action === 'signin-email' && request.method === 'POST' && cronAuthorized(request)) {
    const body = await readWebJson(request, 4_000)
    return json({ ok: true, ...(await emailSignInSteps(isRecord(body) ? body.emails : null)) })
  }

  const member = await requireHubMember(request)
  enforceRateLimit(`wf:${member.id}`, 120, TEN_MINUTES)
  const actor = actorOf(member)

  if (request.method === 'GET') {
    if (action === 'lead') return json(await leadDetail(idFrom(url.searchParams.get('id'), 'lead')))
    if (action === 'tasks') return json(await openTasks())
    if (action === 'glance') return json({ savings: await savingsGlance(glanceLeadIds(url.searchParams.get('ids') || '')) })
    if (action === 'settings') return json({ pricing: await loadSettings(), googleReady: Boolean(googleKey()) })
    if (action === 'preview') {
      const proposal = await selectOne<ProposalRow>('hub_proposals', { id: `eq.${idFrom(url.searchParams.get('proposal'), 'proposal')}` })
      if (!proposal) throw new HttpError(404, 'That proposal was not found.')
      return json({
        html: renderProposalHtml(proposal.snapshot, {
          mode: proposal.status === 'draft' ? 'preview' : 'customer',
          imageUrl: proposal.snapshot.roof.status === 'ok' && googleKey() ? imageUrl(proposal.public_token, url.origin) : null,
          interestedAction: null,
          interestedAt: proposal.interested_at,
        }),
      })
    }
    throw new HttpError(404, 'Not found.')
  }

  if (request.method !== 'POST') throw new HttpError(405, 'Not allowed.')
  assertSameOrigin(request)
  const body = await readWebJson(request, 20_000)
  if (!isRecord(body)) throw new HttpError(400, 'Invalid request.')

  switch (action) {
    case 'settings':
      return json({ pricing: await saveSettings(body.pricing, actor) })
    case 'run': {
      const leadId = idFrom(body.leadId, 'lead')
      await runLead(leadId)
      return json(await leadDetail(leadId))
    }
    case 'overrides': {
      const leadId = idFrom(body.leadId, 'lead')
      await saveOverrides(leadId, body.overrides, actor)
      return json(await leadDetail(leadId))
    }
    case 'approve': {
      const result = await approveProposal(idFrom(body.proposalId, 'proposal'), actor, body.send !== false)
      return json(result)
    }
    case 'shared':
      await markProposalShared(idFrom(body.proposalId, 'proposal'), actor)
      return json({ ok: true })
    case 'task': {
      const taskId = idFrom(body.taskId, 'task')
      if (body.done === false) await reopenTask(taskId)
      else await completeTask(taskId, actor)
      return json({ ok: true })
    }
    case 'signin-email':
      if (member.role !== 'owner' && member.role !== 'admin') throw new HttpError(403, 'Only dashboard admins can send this.')
      return json({ ok: true, ...(await emailSignInSteps(body.emails)) })
    case 'cancel-followup':
      await cancelFollowup(idFrom(body.followupId, 'message'))
      return json({ ok: true })
    case 'delete-lead': {
      const leadId = idFrom(body.leadId, 'lead')
      const now = new Date().toISOString()
      // Try to cancel from hub_appointments
      await patchRows('hub_appointments', { id: `eq.${leadId}` }, { status: 'cancelled', cancelled_at: now }).catch(() => 0)
      // Try hard delete or archive from powergenie_customers
      const deletedCount = await deleteRows('powergenie_customers', { id: `eq.${leadId}` }).catch(() => 0)
      if (!deletedCount) {
        await patchRows('powergenie_customers', { id: `eq.${leadId}` }, {
          archived_at: now,
          archived_by: actor.id,
          updated_at: now,
        }).catch(() => 0)
      }
      return json({ ok: true })
    }
    default:
      throw new HttpError(404, 'Not found.')
  }
}

/** /proposal/{token}, the page the customer opens. */
export async function handleProposalPage(request: Request, url: URL): Promise<Response> {
  enforceRateLimit(`proposal:${clientIp(request)}`, 60, TEN_MINUTES)
  const token = url.searchParams.get('t')
  let proposal = await proposalByToken(token)
  if (!proposal || proposal.status === 'draft') {
    return html(renderMessagePage('Proposal not found', 'This link is not active. Please contact your solar consultant for a new link.'), 404)
  }
  if (proposal.status === 'superseded') {
    return html(renderMessagePage('This proposal was updated', 'A newer version of your proposal was prepared. Please use the latest link we sent you, or call your solar consultant.'))
  }
  let thanks = false
  if (request.method === 'POST' && url.searchParams.get('action') === 'interested') {
    assertSameOrigin(request)
    proposal = (await recordInterest(proposal.public_token)) || proposal
    thanks = true
  } else {
    await recordView(proposal)
  }
  return html(renderProposalHtml(proposal.snapshot, {
    mode: 'customer',
    imageUrl: proposal.snapshot.roof.status === 'ok' && googleKey() ? imageUrl(proposal.public_token) : null,
    interestedAction: `/proposal/${proposal.public_token}/interested`,
    interestedAt: proposal.interested_at,
    thanks,
  }))
}
