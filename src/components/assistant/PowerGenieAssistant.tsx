import React, { Suspense, lazy, useEffect, useState } from 'react'
import { MessageCircle } from 'lucide-react'
import type { AssistantMode } from '../../lib/openAssistant'

const AssistantPanel = lazy(() => import('./AssistantPanel'))

const frameClass =
  'fixed z-[80] flex flex-col bg-[#F6F7FB] text-[#1A1A2E] inset-0 sm:inset-auto sm:bottom-6 sm:right-6 sm:h-[min(740px,calc(100vh-96px))] sm:w-[min(420px,calc(100vw-48px))] sm:overflow-hidden sm:rounded-[28px] sm:border sm:border-[#1A1A2E]/10 sm:shadow-[0_24px_60px_rgba(10,20,40,0.28)]'

export default function PowerGenieAssistant() {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<AssistantMode>('chat')
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    const onOpen = (event: Event) => {
      const detail = (event as CustomEvent<{ mode?: AssistantMode }>).detail
      setMode(detail?.mode || 'chat')
      setNonce(value => value + 1)
      setOpen(true)
    }
    window.addEventListener('powergenie:open', onOpen)
    return () => window.removeEventListener('powergenie:open', onOpen)
  }, [])

  return (
    <>
      {open ? (
        <Suspense fallback={<div className={frameClass} role="status">Opening the Power Genie…</div>}>
          <AssistantPanel frameClass={frameClass} mode={mode} nonce={nonce} onClose={() => setOpen(false)} />
        </Suspense>
      ) : (
        <button
          type="button"
          data-testid="genie-launcher"
          className="fixed z-[70] right-4 bottom-[calc(78px+env(safe-area-inset-bottom))] sm:bottom-6 sm:right-6 inline-flex items-center gap-2 min-h-12 max-w-[calc(100vw-32px)] rounded-full bg-[#FF6B00] px-4 text-[0.95rem] font-bold text-white shadow-[0_10px_24px_rgba(255,107,0,0.35)] hover:brightness-105"
          onClick={() => {
            setMode('chat')
            setNonce(value => value + 1)
            setOpen(true)
          }}
        >
          <MessageCircle className="h-5 w-5 shrink-0" aria-hidden="true" />
          Talk to the Power Genie
        </button>
      )}
    </>
  )
}
