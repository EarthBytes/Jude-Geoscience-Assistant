import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import {
  deleteConversation,
  getConversation,
  listConversations,
  streamChat,
} from './api'
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
} from './components/ai-elements/conversation'
import {
  Message,
  MessageContent,
  MessageResponse,
} from './components/ai-elements/message'
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from './components/ai-elements/prompt-input'
import { Sidebar } from './components/Sidebar'
import type { Conversation as ConversationType, Message as ChatMessage } from './types'

function temporaryId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

export default function App() {
  const [conversations, setConversations] = useState<ConversationType[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<'ready' | 'submitted' | 'streaming'>(
    'ready',
  )
  const [error, setError] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loadingThread, setLoadingThread] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const streamingIdRef = useRef<string | null>(null)

  const refreshConversations = useEffectEvent(async () => {
    const rows = await listConversations()
    setConversations(rows)
  })

  useEffect(() => {
    void (async () => {
      try {
        await refreshConversations()
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load conversations',
        )
      }
    })()
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, status])

  async function selectConversation(id: string) {
    setLoadingThread(true)
    setError(null)
    setActiveId(id)
    try {
      const detail = await getConversation(id)
      setMessages(detail.messages)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load chat')
    } finally {
      setLoadingThread(false)
    }
  }

  function startNewChat() {
    abortRef.current?.abort()
    streamingIdRef.current = null
    setActiveId(null)
    setMessages([])
    setError(null)
    setStatus('ready')
    setInput('')
  }

  async function handleDelete(id: string) {
    const previous = conversations
    // Optimistic remove so deleted chats cannot linger or reappear in the UI
    setConversations((prev) => prev.filter((c) => c.id !== id))
    if (activeId === id) {
      startNewChat()
    }
    try {
      await deleteConversation(id)
      await refreshConversations()
    } catch (err) {
      setConversations(previous)
      setError(err instanceof Error ? err.message : 'Failed to delete chat')
    }
  }

  async function sendMessage(raw: string) {
    const text = raw.trim()
    if (!text || status !== 'ready') return

    setError(null)
    setInput('')
    setStatus('submitted')

    const optimisticUser: ChatMessage = {
      id: temporaryId('user'),
      conversation_id: activeId ?? 'pending',
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }
    const streamingAssistant: ChatMessage = {
      id: temporaryId('assistant'),
      conversation_id: activeId ?? 'pending',
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    }
    streamingIdRef.current = streamingAssistant.id

    setMessages((prev) => [...prev, optimisticUser, streamingAssistant])

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await streamChat(
        {
          conversation_id: activeId,
          message: text,
        },
        {
          onMeta: (meta) => {
            setActiveId(meta.conversation_id)
            setStatus('streaming')
            setMessages((prev) =>
              prev.map((message) => {
                if (message.id === optimisticUser.id) {
                  return meta.user_message
                }
                if (message.id === streamingAssistant.id) {
                  return {
                    ...message,
                    conversation_id: meta.conversation_id,
                  }
                }
                return message
              }),
            )
          },
          onToken: (token) => {
            setStatus('streaming')
            const targetId = streamingIdRef.current
            if (!targetId) return
            setMessages((prev) =>
              prev.map((message) =>
                message.id === targetId
                  ? { ...message, content: message.content + token }
                  : message,
              ),
            )
          },
          onDone: (done) => {
            setActiveId(done.conversation_id)
            streamingIdRef.current = null
            setMessages((prev) => {
              const next = [...prev]
              const lastIdx = next.length - 1
              if (lastIdx >= 0 && next[lastIdx]?.role === 'assistant') {
                next[lastIdx] = done.assistant_message
              }
              return next
            })
            void refreshConversations()
          },
          onError: (message) => {
            setError(message)
            const targetId = streamingIdRef.current
            streamingIdRef.current = null
            setMessages((prev) =>
              prev.filter(
                (m) =>
                  m.id !== targetId &&
                  !(m.role === 'assistant' && !m.content.trim()),
              ),
            )
          },
        },
        controller.signal,
      )
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Chat failed')
        const targetId = streamingIdRef.current
        streamingIdRef.current = null
        setMessages((prev) =>
          prev.filter(
            (m) =>
              m.id !== targetId &&
              !(m.role === 'assistant' && !m.content.trim()),
          ),
        )
      }
    } finally {
      // Drop any leftover empty assistant bubble (failed/incomplete stream)
      setMessages((prev) =>
        prev.filter((m) => !(m.role === 'assistant' && !m.content.trim())),
      )
      setStatus('ready')
      abortRef.current = null
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendMessage(input)
  }

  return (
    <div className="flex h-full min-h-0">
      <Sidebar
        conversations={conversations}
        activeId={activeId}
        open={sidebarOpen}
        onOpen={() => setSidebarOpen(true)}
        onClose={() => setSidebarOpen(false)}
        onSelect={(id) => void selectConversation(id)}
        onNewChat={startNewChat}
        onDelete={(id) => void handleDelete(id)}
      />

      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--border-soft)] px-4 py-3 sm:px-8 md:pl-8">
          <div className="pl-12 md:pl-0">
            <p className="font-display text-lg font-semibold text-[var(--parchment)] md:hidden">
              Jude
            </p>
            <p className="hidden text-sm text-[var(--text-muted)] md:block">
              From rocks to regions, understanding our planet.
            </p>
          </div>
          {status === 'streaming' ? (
            <div className="hidden text-xs text-[var(--mist)] sm:block">
              Jude is writing…
            </div>
          ) : null}
        </header>

        <Conversation>
          <ConversationContent>
            {loadingThread ? (
              <p className="py-20 text-center text-sm text-[var(--text-ink-muted)]">
                Loading conversation…
              </p>
            ) : messages.length === 0 ? (
              <ConversationEmptyState
                title="Jude"
                description="Meet Jude — your companion for understanding the world’s geography and geology."
              />
            ) : (
              messages.map((message) => (
                <Message key={message.id} from={message.role}>
                  <MessageContent from={message.role}>
                    {message.role === 'assistant' ? (
                      <MessageResponse content={message.content} />
                    ) : (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )}
                  </MessageContent>
                </Message>
              ))
            )}
            <div ref={bottomRef} />
          </ConversationContent>

          <div className="border-t border-[var(--border-soft)] bg-[var(--bg-prompt-bar)] px-4 py-4 backdrop-blur-md sm:px-8">
            <div className="mx-auto w-full max-w-3xl">
              {error ? (
                <p className="mb-3 rounded-xl border border-red-400/30 bg-red-950/40 px-3 py-2 text-sm text-red-100">
                  {error}
                </p>
              ) : null}
              <PromptInput onSubmit={handleSubmit}>
                <PromptInputTextarea
                  value={input}
                  onChange={setInput}
                  onSubmit={() => void sendMessage(input)}
                  disabled={status !== 'ready'}
                  placeholder="Ask Jude anything…"
                />
                <PromptInputFooter>
                  <PromptInputSubmit
                    disabled={!input.trim()}
                    status={status}
                  />
                </PromptInputFooter>
              </PromptInput>
            </div>
          </div>
        </Conversation>
      </main>
    </div>
  )
}
