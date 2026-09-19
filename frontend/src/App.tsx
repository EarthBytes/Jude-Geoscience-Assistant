import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import {
  deleteConversation,
  getConversation,
  getMemory,
  importConversations,
  listConversations,
  putMemory,
  setAuthTokenGetter,
  streamChat,
  type GuestThread,
} from './api'
import { AuthControls, useSession } from './auth'
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

function titleFromMessage(message: string, maxLen = 48) {
  const cleaned = message.trim().replace(/\s+/g, ' ')
  if (!cleaned) return 'New chat'
  return cleaned.length <= maxLen ? cleaned : `${cleaned.slice(0, maxLen - 1).trimEnd()}…`
}

export default function App() {
  const auth = useSession()
  const [serverConversations, setServerConversations] = useState<ConversationType[]>(
    [],
  )
  const [guestThreads, setGuestThreads] = useState<GuestThread[]>([])
  const [activeId, setActiveId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [status, setStatus] = useState<'ready' | 'submitted' | 'streaming'>(
    'ready',
  )
  const [error, setError] = useState<string | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [loadingThread, setLoadingThread] = useState(false)
  const [memory, setMemory] = useState('')
  const scrollerRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const streamingIdRef = useRef<string | null>(null)
  const guestThreadsRef = useRef<GuestThread[]>([])
  const importedRef = useRef(false)
  const wasSignedInRef = useRef(false)
  const memoryTimerRef = useRef<number | null>(null)
  const memoryRef = useRef('')

  guestThreadsRef.current = guestThreads
  memoryRef.current = memory

  const isSignedIn = auth.isSignedIn
  const conversations = isSignedIn
    ? serverConversations
    : guestThreads.map((thread) => ({
        id: thread.id,
        title: thread.title,
        created_at: thread.created_at,
        updated_at: thread.updated_at,
      }))

  useEffect(() => {
    setAuthTokenGetter(() => auth.getToken())
  }, [auth])

  const refreshConversations = useCallback(async () => {
    if (!auth.isSignedIn) return
    const rows = await listConversations()
    setServerConversations(rows)
  }, [auth.isSignedIn])

  useEffect(() => {
    if (!auth.isLoaded || !auth.isSignedIn) return
    void (async () => {
      try {
        await refreshConversations()
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load conversations',
        )
      }
    })()
  }, [auth.isLoaded, auth.isSignedIn, refreshConversations])

  useEffect(() => {
    if (!auth.isLoaded || !auth.isSignedIn) return
    void (async () => {
      try {
        const stored = await getMemory()
        const guestNotes = memoryRef.current.trim()
        if (stored.content.trim()) {
          setMemory(stored.content)
        } else if (guestNotes) {
          const saved = await putMemory(guestNotes)
          setMemory(saved.content)
        }
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Could not load your notes',
        )
      }
    })()
  }, [auth.isLoaded, auth.isSignedIn])

  useEffect(() => {
    return () => {
      if (memoryTimerRef.current !== null) {
        window.clearTimeout(memoryTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    if (!auth.isLoaded) return
    if (!auth.isSignedIn) {
      importedRef.current = false
      if (wasSignedInRef.current) {
        setServerConversations([])
        setGuestThreads([])
        abortRef.current?.abort()
        streamingIdRef.current = null
        setActiveId(null)
        setMessages([])
        setStatus('ready')
        setMemory('')
      }
      wasSignedInRef.current = false
      return
    }
    const justSignedIn = !wasSignedInRef.current
    wasSignedInRef.current = true
    if (!justSignedIn || importedRef.current) return
    const snapshot = guestThreadsRef.current.filter(
      (thread) => thread.messages.length > 0,
    )
    if (!snapshot.length) return
    importedRef.current = true
    void (async () => {
      try {
        const imported = await importConversations(
          snapshot.map((thread) => ({
            title: thread.title,
            messages: thread.messages
              .filter(
                (message) =>
                  (message.role === 'user' || message.role === 'assistant') &&
                  message.content.trim(),
              )
              .map((message) => ({
                role: message.role as 'user' | 'assistant',
                content: message.content,
              })),
          })),
        )
        setGuestThreads([])
        setServerConversations(imported)
        const activeIndex = snapshot.findIndex((thread) => thread.id === activeId)
        if (activeIndex >= 0 && imported[activeIndex]) {
          const detail = await getConversation(imported[activeIndex].id)
          setActiveId(detail.id)
          setMessages(detail.messages)
        }
      } catch (err) {
        importedRef.current = false
        setError(
          err instanceof Error ? err.message : 'Could not save your chats',
        )
      }
    })()
  }, [activeId, auth.isLoaded, auth.isSignedIn])

  useEffect(() => {
    const node = scrollerRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }, [messages])

  async function selectConversation(id: string) {
    setLoadingThread(true)
    setError(null)
    setActiveId(id)
    try {
      if (isSignedIn) {
        const detail = await getConversation(id)
        setMessages(detail.messages)
      } else {
        const thread = guestThreads.find((item) => item.id === id)
        setMessages(thread?.messages ?? [])
      }
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
    if (!isSignedIn) {
      setGuestThreads((prev) => prev.filter((thread) => thread.id !== id))
      if (activeId === id) startNewChat()
      return
    }
    const previous = serverConversations
    setServerConversations((prev) => prev.filter((item) => item.id !== id))
    if (activeId === id) {
      startNewChat()
    }
    try {
      await deleteConversation(id)
      await refreshConversations()
    } catch (err) {
      setServerConversations(previous)
      setError(err instanceof Error ? err.message : 'Failed to delete chat')
    }
  }

  function upsertGuestThread(threadId: string, nextMessages: ChatMessage[], title?: string) {
    const now = new Date().toISOString()
    setGuestThreads((prev) => {
      const existing = prev.find((thread) => thread.id === threadId)
      const nextThread: GuestThread = {
        id: threadId,
        title: title ?? existing?.title ?? 'New chat',
        created_at: existing?.created_at ?? now,
        updated_at: now,
        messages: nextMessages,
      }
      return [nextThread, ...prev.filter((thread) => thread.id !== threadId)]
    })
  }

  async function sendMessage(raw: string) {
    const text = raw.trim()
    if (!text || status !== 'ready') return

    setError(null)
    setInput('')
    setStatus('submitted')

    let conversationId = activeId
    if (!isSignedIn && !conversationId) {
      conversationId = crypto.randomUUID()
      setActiveId(conversationId)
    }

    const priorHistory = messages
      .filter(
        (message) =>
          (message.role === 'user' || message.role === 'assistant') &&
          message.content.trim(),
      )
      .map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      }))

    const optimisticUser: ChatMessage = {
      id: temporaryId('user'),
      conversation_id: conversationId ?? 'pending',
      role: 'user',
      content: text,
      timestamp: new Date().toISOString(),
    }
    const streamingAssistant: ChatMessage = {
      id: temporaryId('assistant'),
      conversation_id: conversationId ?? 'pending',
      role: 'assistant',
      content: '',
      timestamp: new Date().toISOString(),
    }
    streamingIdRef.current = streamingAssistant.id

    const nextMessages = [...messages, optimisticUser, streamingAssistant]
    setMessages(nextMessages)
    if (!isSignedIn && conversationId) {
      upsertGuestThread(
        conversationId,
        nextMessages,
        messages.length === 0 ? titleFromMessage(text) : undefined,
      )
    }

    const controller = new AbortController()
    abortRef.current = controller

    try {
      await streamChat(
        {
          conversation_id: isSignedIn ? conversationId : null,
          message: text,
          history: isSignedIn ? [] : priorHistory,
          context: memoryRef.current,
        },
        {
          onMeta: (meta) => {
            if (meta.persisted && meta.conversation_id) {
              setActiveId(meta.conversation_id)
            }
            setStatus('streaming')
            setMessages((prev) =>
              prev.map((message) => {
                if (message.id === optimisticUser.id) {
                  return {
                    ...meta.user_message,
                    id: message.id,
                    conversation_id:
                      meta.persisted && meta.conversation_id
                        ? meta.conversation_id
                        : message.conversation_id,
                  }
                }
                if (message.id === streamingAssistant.id && meta.conversation_id) {
                  return {
                    ...message,
                    conversation_id: meta.persisted
                      ? meta.conversation_id
                      : message.conversation_id,
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
            setMessages((prev) => {
              const updated = prev.map((message) =>
                message.id === targetId
                  ? { ...message, content: message.content + token }
                  : message,
              )
              if (!isSignedIn && conversationId) {
                queueMicrotask(() => upsertGuestThread(conversationId, updated))
              }
              return updated
            })
          },
          onDone: (done) => {
            streamingIdRef.current = null
            if (done.persisted && done.conversation_id) {
              setActiveId(done.conversation_id)
            }
            setMessages((prev) => {
              const next = [...prev]
              const lastIdx = next.length - 1
              if (lastIdx >= 0 && next[lastIdx]?.role === 'assistant') {
                next[lastIdx] = {
                  ...done.assistant_message,
                  id: next[lastIdx].id,
                  conversation_id:
                    done.persisted && done.conversation_id
                      ? done.conversation_id
                      : next[lastIdx].conversation_id,
                }
              }
              if (!isSignedIn && conversationId) {
                upsertGuestThread(conversationId, next)
              }
              return next
            })
            if (done.persisted) {
              void refreshConversations()
            }
          },
          onError: (message) => {
            setError(message)
            streamingIdRef.current = null
            setMessages((prev) =>
              prev.filter((item) => !(item.role === 'assistant' && !item.content.trim())),
            )
          },
        },
        controller.signal,
      )
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setError(err instanceof Error ? err.message : 'Chat failed')
        streamingIdRef.current = null
        setMessages((prev) =>
          prev.filter((item) => !(item.role === 'assistant' && !item.content.trim())),
        )
      }
    } finally {
      setMessages((prev) =>
        prev.filter((item) => !(item.role === 'assistant' && !item.content.trim())),
      )
      setStatus('ready')
      abortRef.current = null
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void sendMessage(input)
  }

  function handleMemoryChange(value: string) {
    setMemory(value)
    if (!isSignedIn) return
    if (memoryTimerRef.current !== null) {
      window.clearTimeout(memoryTimerRef.current)
    }
    memoryTimerRef.current = window.setTimeout(() => {
      void putMemory(value).catch((err) => {
        setError(
          err instanceof Error ? err.message : 'Could not save your notes',
        )
      })
    }, 600)
  }

  function handleStop() {
    abortRef.current?.abort()
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
        memory={memory}
        isSignedIn={Boolean(isSignedIn)}
        onMemoryChange={handleMemoryChange}
      />

      <main className="relative flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-[var(--border-soft)] px-4 py-3.5 sm:px-8 md:pl-8">
          <div className="pl-12 md:pl-0">
            <p className="font-display text-lg font-semibold tracking-tight text-[var(--parchment)] md:hidden">
              Jude
            </p>
            <p className="hidden text-sm tracking-wide text-[var(--text-muted)] md:block">
              From rocks to regions, understanding our planet.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {status === 'streaming' ? (
              <div
                className="hidden items-center gap-2 rounded-full border border-[var(--border-soft)] bg-[var(--hover-on-dark)] px-3 py-1 text-xs text-[var(--mist)] sm:flex"
                aria-live="polite"
              >
                <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-[var(--fern)]" />
                Jude is writing
              </div>
            ) : null}
            <AuthControls />
          </div>
        </header>

        <Conversation>
          <ConversationContent
            ref={scrollerRef}
            center={messages.length === 0 && !loadingThread}
          >
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
          </ConversationContent>

          <div className="border-t border-[var(--border-soft)] bg-[var(--bg-prompt-bar)] px-4 py-4 backdrop-blur-md sm:px-8">
            <div className="mx-auto w-full max-w-3xl">
              {error ? (
                <p
                  className="mb-3 rounded-xl border border-red-400/30 bg-red-950/40 px-3 py-2 text-sm text-red-100"
                  role="alert"
                  aria-live="assertive"
                >
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
                    onStop={handleStop}
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
