import type {
  ChatDoneEvent,
  ChatMetaEvent,
  Conversation,
  ConversationDetail,
  HistoryTurn,
  Message,
  TaskType,
} from './types'

const API_BASE = import.meta.env.VITE_API_BASE ?? ''

let tokenGetter: () => Promise<string | null> = async () => null

export function setAuthTokenGetter(getter: () => Promise<string | null>) {
  tokenGetter = getter
}

async function authHeaders(): Promise<Record<string, string>> {
  const token = await tokenGetter()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
      ...(init?.headers ?? {}),
    },
  })

  if (!response.ok) {
    let detail = `Request failed (${response.status})`
    try {
      const data = (await response.json()) as { detail?: string }
      if (typeof data.detail === 'string' && data.detail) detail = data.detail
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

export function importConversations(
  conversations: Array<{
    title: string
    messages: HistoryTurn[]
  }>,
) {
  return request<Conversation[]>('/api/conversations/import', {
    method: 'POST',
    body: JSON.stringify({ conversations }),
  })
}

export function getConversation(id: string) {
  return request<ConversationDetail>(`/api/conversations/${id}`)
}

export function deleteConversation(id: string) {
  return request<void>(`/api/conversations/${id}`, { method: 'DELETE' })
}

export function getMemory() {
  return request<{ content: string; updated_at: string }>('/api/memory')
}

export function putMemory(content: string) {
  return request<{ content: string; updated_at: string }>('/api/memory', {
    method: 'PUT',
    body: JSON.stringify({ content }),
  })
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
    history?: HistoryTurn[]
    context?: string
  },
  handlers: StreamHandlers,
  signal?: AbortSignal,
): Promise<void> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(await authHeaders()),
      },
      body: JSON.stringify({
        conversation_id: payload.conversation_id ?? null,
        message: payload.message,
        task: payload.task ?? 'general',
        stream: true,
        history: payload.history ?? [],
        context: payload.context ?? '',
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
      if (typeof data.detail === 'string' && data.detail) detail = data.detail
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

  if (finished === null && buffer.trim()) {
    const result = dispatchSsePart(
      buffer.replace(/\r\n/g, '\n').replace(/\r/g, ''),
      handlers,
    )
    if (result === 'token') receivedTokens = true
    if (result === 'done' || result === 'error') {
      finished = result
    }
  }

  if (finished === null && !receivedTokens) {
    handlers.onError('The assistant connection closed without a reply.')
  }
}

export type GuestThread = Conversation & { messages: Message[] }
