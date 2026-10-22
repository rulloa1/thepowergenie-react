export type AssistantMode = 'chat' | 'bill' | 'book'

export function openAssistant(mode: AssistantMode = 'chat') {
  window.dispatchEvent(new CustomEvent('powergenie:open', { detail: { mode } }))
}
