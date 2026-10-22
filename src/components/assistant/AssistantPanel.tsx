import React, { useEffect, useMemo, useRef, useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import { CalendarCheck, Loader2, Upload, X } from 'lucide-react'
import type { AssistantMode } from '../../lib/openAssistant'
import {
  EMPTY_BILL,
  MAX_BILL_BYTES,
  TCPA_TEXT,
  type BillFields,
  type Confirmation,
  type ReferralSource,
  type Slot,
  REFERRAL_SOURCES,
} from '../../../shared/types'

type Phase = 'chat' | 'bill' | 'confirm' | 'book' | 'done'

const fieldClass =
  'w-full min-h-11 rounded-xl border border-[#1A1A2E]/15 bg-white px-3 text-base text-[#1A1A2E] outline-none focus:border-[#FF6B00] focus:ring-2 focus:ring-[#FF6B00]/30'

const primaryClass =
  'inline-flex min-h-11 items-center justify-center rounded-full bg-[#FF6B00] px-4 font-bold text-white disabled:opacity-50'

const quietClass =
  'inline-flex min-h-11 items-center justify-center rounded-full border border-[#1A1A2E]/15 bg-white px-4 font-semibold text-[#1A1A2E]'

type PanelProps = {
  frameClass: string
  mode: AssistantMode
  nonce: number
  onClose: () => void
}

export default function AssistantPanel({ frameClass, mode, nonce, onClose }: PanelProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const honeypotRef = useRef<HTMLInputElement>(null)
  const [phase, setPhase] = useState<Phase>(mode === 'bill' ? 'bill' : mode === 'book' ? 'book' : 'chat')
  const [clientRequestId, setClientRequestId] = useState(() => crypto.randomUUID())
  const [bill, setBill] = useState<BillFields>(EMPTY_BILL)
  const [receipt, setReceipt] = useState<string | null>(null)
  const [fileName, setFileName] = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [address, setAddress] = useState('')
  const [utility, setUtility] = useState('')
  const [windows, setWindows] = useState('')
  const [slots, setSlots] = useState<Slot[]>([])
  const [slotStart, setSlotStart] = useState('')
  const [consent, setConsent] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const phaseRef = useRef(phase)
  phaseRef.current = phase

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/chat',
        body: () => ({ pg_leave_blank: honeypotRef.current?.value ?? '' }),
      }),
    [],
  )
  const { messages, sendMessage, status, error: chatError, stop } = useChat({ transport })
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (!nonce) return
    if (phaseRef.current === 'done') reset()
    setPhase(mode === 'bill' ? 'bill' : mode === 'book' ? 'book' : 'chat')
    setError('')
  }, [nonce, mode])

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const node = panelRef.current
    const focusable = () =>
      node
        ? [...node.querySelectorAll<HTMLElement>('button, [href], input, textarea, select')]
            .filter(element => !element.hasAttribute('disabled') && element.tabIndex !== -1 && element.getAttribute('aria-hidden') !== 'true')
        : []
    focusable()[0]?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
        return
      }
      if (event.key !== 'Tab' || !node) return
      const items = focusable()
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previous
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  useEffect(() => {
    if (phase !== 'book') return
    let cancel = false
    setBusy('Loading open times…')
    fetch('/api/slots')
      .then(async response => {
        const payload = await response.json()
        if (!response.ok) throw new Error(payload.error || 'Times are unavailable.')
        if (!cancel) setSlots(payload.slots || [])
      })
      .catch(reason => {
        if (!cancel) setError(reason instanceof Error ? reason.message : 'Times are unavailable.')
      })
      .finally(() => {
        if (!cancel) setBusy('')
      })
    return () => {
      cancel = true
    }
  }, [phase])

  function reset() {
    setClientRequestId(crypto.randomUUID())
    setBill(EMPTY_BILL)
    setReceipt(null)
    setFileName(null)
    setWarning(null)
    setName('')
    setPhone('')
    setEmail('')
    setAddress('')
    setUtility('')
    setWindows('')
    setSlotStart('')
    setConsent(false)
    setConfirmation(null)
    setError('')
  }

  async function onFile(file: File | undefined) {
    if (!file) return
    setError('')
    setBusy('Uploading your bill…')
    try {
      const prepared = await prepareBillFile(file)
      const started = await postJson<{ signedUrl: string; receipt: string }>('/api/uploads', {
        fileName: prepared.name,
        mimeType: prepared.type,
        sizeBytes: prepared.size,
        pg_leave_blank: honeypotRef.current?.value ?? '',
      })
      const body = new FormData()
      body.append('cacheControl', '3600')
      body.append('', prepared, prepared.name)
      const uploaded = await fetch(started.signedUrl, { method: 'PUT', body })
      if (!uploaded.ok) throw new Error('The bill could not be uploaded. Please try again.')
      setBusy('Reading your bill…')
      const read = await postJson<{ fields: BillFields; warning: string | null }>('/api/bill', {
        receipt: started.receipt,
        pg_leave_blank: honeypotRef.current?.value ?? '',
      })
      setReceipt(started.receipt)
      setFileName(prepared.name)
      setBill({ ...EMPTY_BILL, ...read.fields })
      setWarning(read.warning)
      if (read.fields.customerName) setName(read.fields.customerName)
      if (read.fields.serviceAddress) setAddress(read.fields.serviceAddress)
      if (read.fields.utility) setUtility(read.fields.utility)
      setPhase('confirm')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The bill could not be read.')
    } finally {
      setBusy('')
    }
  }

  async function submitLead() {
    setError('')
    if (!consent) {
      setError('Please agree to be contacted before booking.')
      return
    }
    setBusy('Booking your consult…')
    try {
      let referralSource: ReferralSource | null = null
      try {
        const stored = sessionStorage.getItem('powergenie-source')
        if (stored && (REFERRAL_SOURCES as readonly string[]).includes(stored)) referralSource = stored as ReferralSource
      } catch {
        referralSource = null
      }
      const result = await postJson<{ confirmation: Confirmation }>('/api/lead', {
        clientRequestId,
        pg_leave_blank: honeypotRef.current?.value ?? '',
        consent,
        name,
        phone,
        email,
        serviceAddress: address,
        utility,
        preferredWindows: windows,
        slotStart,
        referralSource,
        receipt,
        bill,
      })
      setConfirmation(result.confirmation)
      setPhase('done')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'We could not book that time.')
    } finally {
      setBusy('')
    }
  }

  const chatting = status === 'submitted' || status === 'streaming'
  const slotGroups = groupSlots(slots)

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby="genie-title"
      data-testid="genie-panel"
      className={frameClass}
    >
      <header className="flex items-center gap-3 bg-[#0B2233] px-4 py-[max(12px,env(safe-area-inset-top))] text-white sm:py-4">
        <img src="/assets/brand/power-genie-icon.png" alt="" className="h-10 w-10 rounded-xl bg-white/10 object-cover" />
        <div className="min-w-0 flex-1">
          <h2 id="genie-title" className="truncate text-base font-bold">
            The Power Genie
          </h2>
          <p className="truncate text-xs text-[#D9E6F2]">Questions, your bill, and a free consult with Horace</p>
        </div>
        <button type="button" className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10" onClick={onClose} aria-label="Close">
          <X className="h-5 w-5" />
        </button>
      </header>

      <div className="relative flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <div className="absolute h-0 w-0 overflow-hidden" aria-hidden="true">
          <label>
            Leave this blank
            <input ref={honeypotRef} name="pg_leave_blank" tabIndex={-1} autoComplete="off" defaultValue="" />
          </label>
        </div>

        {phase === 'chat' && (
          <div className="space-y-3">
            <Bubble from="assistant">
              Hi, I’m the Power Genie assistant. I can answer general questions about going solar with Sunrun, help you upload your electric bill, and book a free savings consult with Horace Lawrence. I won’t guess a price or a savings number — Horace runs those from your bill.
            </Bubble>
            {messages.map(message => (
              <Bubble key={message.id} from={message.role === 'user' ? 'user' : 'assistant'}>
                {message.parts.map((part, index) => (part.type === 'text' ? <span key={index}>{part.text}</span> : null))}
              </Bubble>
            ))}
            {chatting && (
              <p className="flex items-center gap-2 text-sm text-[#4A5568]">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Thinking…
                <button type="button" className="font-semibold text-[#0066CC]" onClick={() => stop()}>
                  Stop
                </button>
              </p>
            )}
            {chatError && (
              <p role="alert" className="text-sm text-[#9B2C2C]">
                I couldn’t answer that just now. You can still upload your bill or book a consult.
              </p>
            )}
            <div className="flex flex-col gap-2">
              <button type="button" className={quietClass} onClick={() => sendMessage({ text: 'What does going solar with Sunrun involve?' })} disabled={chatting}>
                What does going solar involve?
              </button>
              <button type="button" className={primaryClass} onClick={() => setPhase('bill')}>
                <Upload className="mr-2 h-4 w-4" aria-hidden="true" />
                Upload my light bill
              </button>
              <button type="button" className={quietClass} onClick={() => setPhase('book')}>
                <CalendarCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                Book a free savings consult
              </button>
            </div>
          </div>
        )}

        {phase === 'bill' && (
          <section className="space-y-3">
            <h3 className="text-lg font-bold">Upload your electric bill</h3>
            <p className="text-sm leading-relaxed text-[#4A5568]">
              A photo or PDF is enough. Horace uses it for the savings estimate. JPEG, PNG, WEBP, or PDF, up to 10 MB.
            </p>
            <label className={`${primaryClass} w-full cursor-pointer`}>
              Take a photo
              <input
                className="sr-only"
                type="file"
                accept="image/*"
                capture="environment"
                onChange={event => {
                  void onFile(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </label>
            <label className={`${quietClass} w-full cursor-pointer`}>
              Choose a file
              <input
                data-testid="bill-file"
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf,.pdf"
                onChange={event => {
                  void onFile(event.target.files?.[0])
                  event.target.value = ''
                }}
              />
            </label>
            <button type="button" className="text-sm font-semibold text-[#0066CC]" onClick={() => setPhase('book')}>
              Continue without a bill
            </button>
          </section>
        )}

        {phase === 'confirm' && (
          <section className="space-y-3" data-testid="bill-confirm">
            <h3 className="text-lg font-bold">Check your bill</h3>
            <p className="text-sm leading-relaxed text-[#4A5568]">
              {fileName ? `From ${fileName}. ` : ''}
              Please correct anything that’s off. These details are what Horace receives — not a solar quote.
            </p>
            {warning && <p className="rounded-xl bg-[#FFF4E8] px-3 py-2 text-sm text-[#7A3E00]">{warning}</p>}
            <BillField label="Name on the bill" value={bill.customerName} onChange={value => setBill({ ...bill, customerName: value })} />
            <BillField label="Service address" value={bill.serviceAddress} onChange={value => setBill({ ...bill, serviceAddress: value })} />
            <BillField label="Utility" value={bill.utility} onChange={value => setBill({ ...bill, utility: value })} />
            <BillField label="Account number" value={bill.accountNumber} onChange={value => setBill({ ...bill, accountNumber: value })} />
            <BillField label="Bill date" value={bill.billDate} onChange={value => setBill({ ...bill, billDate: value })} />
            <BillField label="Rate plan" value={bill.ratePlan} onChange={value => setBill({ ...bill, ratePlan: value })} />
            <BillField label="kWh this period" value={numToText(bill.kwhThisPeriod)} onChange={value => setBill({ ...bill, kwhThisPeriod: textToNum(value) })} inputMode="decimal" />
            <BillField label="Days in period" value={numToText(bill.days)} onChange={value => setBill({ ...bill, days: textToNum(value) })} inputMode="numeric" />
            <BillField label="kWh same month last year" value={numToText(bill.kwhSameMonthLastYear)} onChange={value => setBill({ ...bill, kwhSameMonthLastYear: textToNum(value) })} inputMode="decimal" />
            <BillField label="Current charges" value={numToText(bill.currentCharges)} onChange={value => setBill({ ...bill, currentCharges: textToNum(value) })} inputMode="decimal" />
            <BillField label="Total due" value={numToText(bill.totalDue)} onChange={value => setBill({ ...bill, totalDue: textToNum(value) })} inputMode="decimal" />
            <BillField label="Past due" value={numToText(bill.pastDue)} onChange={value => setBill({ ...bill, pastDue: textToNum(value) })} inputMode="decimal" />
          </section>
        )}

        {phase === 'book' && (
          <section className="space-y-3">
            <h3 className="text-lg font-bold">Book a free savings consult</h3>
            <p className="text-sm leading-relaxed text-[#4A5568]">
              Horace Lawrence will use this to reach you. Times are in Central Time, weekdays and Saturday. This savings consult is filed with your bill for Horace. A separate one-hour calendar call is on the{' '}
              <a className="font-semibold text-[#0066CC]" href="/book">booking page</a>.
            </p>
            <label className="block text-sm font-semibold">
              Name
              <input className={`${fieldClass} mt-1`} value={name} onChange={event => setName(event.target.value)} autoComplete="name" required />
            </label>
            <label className="block text-sm font-semibold">
              Phone
              <input className={`${fieldClass} mt-1`} value={phone} onChange={event => setPhone(event.target.value)} autoComplete="tel" inputMode="tel" required />
            </label>
            <label className="block text-sm font-semibold">
              Email
              <input className={`${fieldClass} mt-1`} value={email} onChange={event => setEmail(event.target.value)} autoComplete="email" inputMode="email" required />
            </label>
            <label className="block text-sm font-semibold">
              Service address
              <input className={`${fieldClass} mt-1`} value={address} onChange={event => setAddress(event.target.value)} autoComplete="street-address" required />
            </label>
            <label className="block text-sm font-semibold">
              Utility
              <input className={`${fieldClass} mt-1`} value={utility} onChange={event => setUtility(event.target.value)} placeholder="Entergy, CenterPoint…" />
            </label>
            <label className="block text-sm font-semibold">
              Preferred windows <span className="font-normal text-[#4A5568]">(optional)</span>
              <textarea className={`${fieldClass} mt-1 min-h-20 py-2`} value={windows} onChange={event => setWindows(event.target.value)} placeholder="Weekday mornings" />
            </label>
            <fieldset>
              <legend className="text-sm font-semibold">Pick a time</legend>
              {slots.length === 0 && !busy && <p className="mt-2 text-sm text-[#4A5568]">No open times in the next two weeks. Call Horace and he’ll find one.</p>}
              <div className="mt-2 max-h-64 space-y-3 overflow-y-auto pr-1">
                {slotGroups.map(group => (
                  <div key={group.day}>
                    <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[#4A5568]">{group.day}</p>
                    <div className="flex flex-wrap gap-2">
                      {group.slots.map(slot => (
                        <button
                          type="button"
                          key={slot.start}
                          aria-pressed={slotStart === slot.start}
                          className={`min-h-10 rounded-full px-3 text-sm font-semibold ${slotStart === slot.start ? 'bg-[#0B2233] text-white' : 'bg-white text-[#1A1A2E] ring-1 ring-[#1A1A2E]/15'}`}
                          onClick={() => setSlotStart(slot.start)}
                        >
                          {slot.time}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </fieldset>
          </section>
        )}

        {phase === 'done' && confirmation && (
          <section className="space-y-3" data-testid="booking-confirmation">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[#FF6B00] text-2xl text-white" aria-hidden="true">
              ✓
            </div>
            <h3 className="text-center text-xl font-bold">Your consult is booked</h3>
            <p className="text-center text-sm leading-relaxed text-[#4A5568]">
              Horace Lawrence has this request and will contact you to walk through the savings estimate.
            </p>
            <dl className="space-y-2 rounded-2xl bg-white p-4 text-sm shadow-sm">
              <Row label="Name" value={confirmation.name} />
              <Row label="When" value={confirmation.slotLabel} />
              <Row label="Phone" value={confirmation.phone} />
              <Row label="Email" value={confirmation.email} />
              <Row label="Bill" value={confirmation.billAttached ? 'Attached for Horace' : 'Not attached yet'} />
            </dl>
            <p className="text-center text-xs text-[#4A5568]">Reference {confirmation.id.slice(0, 8)}</p>
            <button
              type="button"
              className={quietClass + ' w-full'}
              onClick={() => {
                reset()
                setPhase('chat')
              }}
            >
              Start another request
            </button>
          </section>
        )}

        {busy && (
          <p className="flex items-center gap-2 text-sm text-[#4A5568]" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {busy}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-[#9B2C2C]">
            {error}
          </p>
        )}
      </div>

      {phase === 'chat' && (
        <form
          className="border-t border-[#1A1A2E]/10 p-3 pb-[max(12px,env(safe-area-inset-bottom))]"
          onSubmit={event => {
            event.preventDefault()
            const text = draft.trim()
            if (!text || chatting) return
            void sendMessage({ text })
            setDraft('')
          }}
        >
          <div className="flex gap-2">
            <input
              className={fieldClass}
              value={draft}
              onChange={event => setDraft(event.target.value)}
              placeholder="Ask about going solar"
              aria-label="Message"
              disabled={chatting}
            />
            <button type="submit" className={primaryClass} disabled={chatting || !draft.trim()}>
              Send
            </button>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[#4A5568]">Horace gives the exact prices, savings, and incentives. This chat isn’t saved.</p>
        </form>
      )}

      {phase === 'confirm' && (
        <footer className="flex gap-2 border-t border-[#1A1A2E]/10 p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <button type="button" className={quietClass} onClick={() => setPhase('bill')}>
            Back
          </button>
          <button
            type="button"
            className={`${primaryClass} flex-1`}
            onClick={() => {
              if (bill.customerName) setName(bill.customerName)
              if (bill.serviceAddress) setAddress(bill.serviceAddress)
              if (bill.utility) setUtility(bill.utility)
              setPhase('book')
            }}
          >
            Use these details
          </button>
        </footer>
      )}

      {phase === 'book' && (
        <footer className="space-y-3 border-t border-[#1A1A2E]/10 p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <label className="flex items-start gap-3 text-sm leading-snug">
            <input
              data-testid="tcpa-consent"
              className="mt-1 h-5 w-5 shrink-0 accent-[#FF6B00]"
              type="checkbox"
              checked={consent}
              onChange={event => setConsent(event.target.checked)}
            />
            <span>{TCPA_TEXT}</span>
          </label>
          <div className="flex gap-2">
            <button type="button" className={quietClass} onClick={() => setPhase(receipt ? 'confirm' : 'chat')}>
              Back
            </button>
            <button type="button" className={`${primaryClass} flex-1`} disabled={!consent || !slotStart || Boolean(busy)} onClick={() => void submitLead()}>
              Book my consult
            </button>
          </div>
        </footer>
      )}

      {phase === 'bill' && (
        <footer className="p-3 pb-[max(12px,env(safe-area-inset-bottom))]">
          <button type="button" className={quietClass} onClick={() => setPhase('chat')}>
            Back to questions
          </button>
        </footer>
      )}
    </div>
  )
}

function Bubble({ from, children }: { from: 'user' | 'assistant'; children: React.ReactNode }) {
  const mine = from === 'user'
  return (
    <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[90%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-relaxed ${mine ? 'bg-[#0B2233] text-white' : 'bg-white text-[#1A1A2E] shadow-sm'}`}>
        {children}
      </div>
    </div>
  )
}

function BillField({
  label,
  value,
  onChange,
  inputMode,
}: {
  label: string
  value: string | null
  onChange: (value: string | null) => void
  inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']
}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <input
        className={`${fieldClass} mt-1`}
        value={value ?? ''}
        inputMode={inputMode}
        onChange={event => onChange(event.target.value.trim() ? event.target.value : null)}
      />
    </label>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-[#4A5568]">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  )
}

function groupSlots(slots: Slot[]): Array<{ day: string; slots: Slot[] }> {
  const groups: Array<{ day: string; slots: Slot[] }> = []
  for (const slot of slots) {
    const last = groups[groups.length - 1]
    if (!last || last.day !== slot.day) groups.push({ day: slot.day, slots: [slot] })
    else last.slots.push(slot)
  }
  return groups
}

function numToText(value: number | null): string | null {
  return value == null ? null : String(value)
}

function textToNum(value: string | null): number | null {
  if (!value || !value.trim()) return null
  const parsed = Number(value.replace(/[$,\s]/g, ''))
  return Number.isFinite(parsed) ? parsed : null
}

async function prepareBillFile(file: File): Promise<File> {
  const type = file.type || mimeFromName(file.name)
  if (file.size > MAX_BILL_BYTES && !type.startsWith('image/')) {
    throw new Error('That file is over 10 MB. Try a photo or a smaller PDF.')
  }
  if (!type.startsWith('image/') || type === 'image/gif') {
    if (file.size > MAX_BILL_BYTES) throw new Error('That file is over 10 MB. Try a photo or a smaller PDF.')
    return file.type ? file : new File([file], file.name, { type })
  }
  if (file.size < 1_500_000) return file.type ? file : new File([file], file.name, { type })
  try {
    const bitmap = await createImageBitmap(file)
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) return file
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    bitmap.close()
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85))
    if (!blob) return file
    if (blob.size > MAX_BILL_BYTES) throw new Error('That photo is still over 10 MB. Try a PDF or a smaller image.')
    return new File([blob], 'light-bill.jpg', { type: 'image/jpeg' })
  } catch (error) {
    if (error instanceof Error && error.message.includes('10 MB')) throw error
    if (file.size > MAX_BILL_BYTES) throw new Error('That file is over 10 MB. Try a photo or a smaller PDF.')
    return file
  }
}

function mimeFromName(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.pdf')) return 'application/pdf'
  return 'image/jpeg'
}

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const payload = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) throw new Error(payload.error || 'Something went wrong. Please try again.')
  return payload as T
}
