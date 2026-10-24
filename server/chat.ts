import {
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  streamText,
  toUIMessageStream,
  type UIMessage,
} from 'ai'
import { ASSISTANT_INSTRUCTIONS, assistantModel, mockAiEnabled } from './prompt.js'

const FALLBACK =
  'I cannot reach the assistant right now. Horace Lawrence still runs the real numbers from your electric bill. Use the buttons here to upload the bill or book a free savings consult, and he will follow up.'

function cannedReply(question: string): string {
  const text = question.toLowerCase()
  if (/price|cost|save|saving|incentive|credit|rebate|warranty|zero down|payment|cheap/.test(text)) {
    return 'I can’t give a price, a savings guarantee, or an incentive amount from here. Those depend on your home and your bill. Upload the bill and book a free savings consult, and Horace Lawrence will run the numbers with you.'
  }
  if (/battery|outage|backup|storm/.test(text)) {
    return 'A home battery can store solar energy and help keep some of the house on during an outage. What it covers, and what it costs, is part of the design Horace Lawrence reviews with you. Your electric bill is the best place to start.'
  }
  return 'Going solar with The Power Genie means a Sunrun system that Horace Lawrence walks through with you, using your electric bill. I can answer general questions, and the buttons here will upload a bill or book a free savings consult. I don’t quote prices or promise savings.'
}

export function streamTextResponse(text: string): Response {
  return createUIMessageStreamResponse({
    stream: createUIMessageStream({
      execute({ writer }) {
        const id = 'assistant'
        writer.write({ type: 'start' })
        writer.write({ type: 'text-start', id })
        writer.write({ type: 'text-delta', id, delta: text })
        writer.write({ type: 'text-end', id })
        writer.write({ type: 'finish' })
      },
    }),
  })
}

function textOf(message: UIMessage): string {
  const parts = Array.isArray(message.parts) ? message.parts : []
  return parts
    .filter(part => part.type === 'text')
    .map(part => part.text)
    .join('\n')
    .slice(0, 2000)
}

export function latestUserText(messages: UIMessage[]): string {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message?.role !== 'user') continue
    return textOf(message)
  }
  return ''
}

/** Drops files, tool parts, and oversized history so a chat request cannot smuggle a bill into the model. */
export function publicMessages(messages: UIMessage[]): UIMessage[] {
  return messages.slice(-12).flatMap(message => {
    if (!message || (message.role !== 'user' && message.role !== 'assistant')) return []
    const text = textOf(message).trim()
    if (!text) return []
    return [{ id: message.id || 'msg', role: message.role, parts: [{ type: 'text' as const, text }] }]
  })
}

export async function streamAssistant(messages: UIMessage[]): Promise<Response> {
  const cleaned = publicMessages(messages)
  const question = latestUserText(cleaned)
  if (!question) {
    return streamTextResponse('Ask me a question about going solar, or use the buttons to upload your bill or book a consult.')
  }
  if (mockAiEnabled()) return streamTextResponse(cannedReply(question))

  try {
    const result = streamText({
      model: assistantModel(),
      instructions: ASSISTANT_INSTRUCTIONS,
      messages: await convertToModelMessages(cleaned),
      maxOutputTokens: 400,
      temperature: 0.3,
      maxRetries: 1,
    })
    return createUIMessageStreamResponse({
      stream: toUIMessageStream({ stream: result.stream }),
    })
  } catch (error) {
    console.error('chat_failed', error instanceof Error ? error.name : 'unknown')
    return streamTextResponse(FALLBACK)
  }
}
