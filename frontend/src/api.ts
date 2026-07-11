import type {
  ChatDoneEvent,
  ChatMetaEvent,
  Conversation,
  ConversationDetail,
  TaskType,
} from './types'

const API_BASE = import.meta.env.VITE_API_BASE ?? ''

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    let detail = `Request failed (${response.status})`
    try {
      const data = (await response.json()) as { detail?: string }
      if (data.detail) detail = data.detail
    } catch {
      // ignore parse errors
    }
    throw new Error(detail)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

export function listConversations() {
  return request<Conversation[]>('/api/conversations')
}

export function createConversation(title = 'New chat') {
  return request<Conversation>('/api/conversations', {
    method: 'POST',
    body: JSON.stringify({ title }),
  })
}

export function getConversation(id: string) {
  return request<ConversationDetail>(`/api/conversations/${id}`)
}

export function deleteConversation(id: string) {
  return request<void>(`/api/conversations/${id}`, { method: 'DELETE' })
}

export interface StreamHandlers {
  onMeta: (meta: ChatMetaEvent) => void
  onToken: (token: string) => void
  onDone: (done: ChatDoneEvent) => void
  onError: (message: string) => void
}

function dispatchSsePart(
  part: string,
  handlers: StreamHandlers,
): 'done' | 'error' | 'token' | 'other' {
  // Normalise any leftover CR so "event:" / "data:" prefixes match cleanly
  const lines = part.replace(/\r/g, '').split('\n')
  let event = 'message'
  const dataLines: string[] = []

  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim()
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim())
    }
  }

  if (!dataLines.length) return 'other'
  const raw = dataLines.join('\n')

  try {
    const data = JSON.parse(raw) as Record<string, unknown>
    if (event === 'meta') {
      handlers.onMeta(data as unknown as ChatMetaEvent)
    } else if (event === 'token') {
      handlers.onToken(String(data.content ?? ''))
      return 'token'
    } else if (event === 'done') {
      handlers.onDone(data as unknown as ChatDoneEvent)
      return 'done'
    } else if (event === 'error') {
      handlers.onError(String(data.detail ?? 'Unknown error'))
      return 'error'
    }
  } catch {
    // skip malformed chunks
  }
  return 'other'
}

export async function streamChat(
  payload: {
    conversation_id?: string | null
    message: string
    task?: TaskType
  },
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        conversation_id: payload.conversation_id ?? null,
        message: payload.message,
        task: payload.task ?? 'general',
        stream: true,
      }),
      signal,
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new Error(
      err instanceof Error
        ? `Could not reach the API (${err.message}). Is the backend running?`
        : 'Could not reach the API. Is the backend running?',
    )
  }

  if (!response.ok || !response.body) {
    let detail = `Chat failed (${response.status})`
    try {
      const data = (await response.json()) as { detail?: string }
      if (data.detail) detail = data.detail
    } catch {
      // ignore
    }
    throw new Error(detail)
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let finished: 'done' | 'error' | null = null
  let receivedTokens = false

  while (finished === null) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    // sse-starlette defaults to CRLF (\r\n). Splitting on "\n\n" never matches
    // "\r\n\r\n", so normalise before framing events on blank lines.
    buffer = buffer.replace(/\r\n/g, '\n')

    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''

    for (const part of parts) {
      const result = dispatchSsePart(part, handlers)
      if (result === 'token') receivedTokens = true
      if (result === 'done' || result === 'error') {
        finished = result
        break
      }
    }
  }

  // Flush any trailing SSE event that lacked a final blank line
  if (finished === null && buffer.trim()) {
    const result = dispatchSsePart(buffer.replace(/\r\n/g, '\n').replace(/\r/g, ''), handlers)
    if (result === 'token') receivedTokens = true
    if (result === 'done' || result === 'error') {
      finished = result
    }
  }

  // Only treat a silent close as failure when nothing useful arrived.
  // Tokens and/or a done event mean the assistant did reply.
  if (finished === null && !receivedTokens) {
    handlers.onError('The assistant connection closed without a reply.')
  }
}
