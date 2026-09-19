import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { Copy, Download, Pencil, RefreshCw } from 'lucide-react'
import {
  deleteConversation,
  getConversation,
  getMemory,
  importConversations,
  listConversations,
  putMemory,
  renameConversation,
  rewindConversation,
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
  MessageActionButton,
  MessageActions,
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
import {
  copyText,
  downloadTextFile,
  slugifyFilename,
  threadToMarkdown,
} from './lib/utils'
import type { Conversation as ConversationType, Message as ChatMessage } from './types'

function temporaryId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`
}

function titleFromMessage(message: string, maxLen = 48) {
  const cleaned = message.trim().replace(/\s+/g, ' ')
  if (!cleaned) return 'New chat'
  return cleaned.length <= maxLen ? cleaned : `${cleaned.slice(0, maxLen - 1).trimEnd()}…`
}

function lastIndexOfRole(messages: ChatMessage[], role: ChatMessage['role']) {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === role && messages[index].content.trim()) {
      return index
    }
  }
  return -1
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

  const lastUserIndex = lastIndexOfRole(messages, 'user')
  const lastAssistantIndex = lastIndexOfRole(messages, 'assistant')
  const activeTitle =
    conversations.find((item) => item.id === activeId)?.title ?? 'Jude chat'

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

  async function handleRename(id: string, title: string) {
    if (!isSignedIn) {
      setGuestThreads((prev) =>
        prev.map((thread) =>
          thread.id === id
            ? { ...thread, title, updated_at: new Date().toISOString() }
            : thread,
        ),
      )
      return
    }
    const previous = serverConversations
    setServerConversations((prev) =>
      prev.map((item) => (item.id === id ? { ...item, title } : item)),
    )
    try {
      const updated = await renameConversation(id, title)
      setServerConversations((prev) =>
        prev.map((item) => (item.id === id ? updated : item)),
      )
    } catch (err) {
      setServerConversations(previous)
      setError(err instanceof Error ? err.message : 'Failed to rename chat')
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

  async function sendMessage(raw: string, options?: { regenerate?: boolean }) {
    const text = raw.trim()
    const regenerate = Boolean(options?.regenerate)
    if (!text || status !== 'ready') return

    setError(null)
    if (!regenerate) setInput('')
    setStatus('submitted')

    let conversationId = activeId
    if (!isSignedIn && !conversationId) {
      conversationId = crypto.randomUUID()
      setActiveId(conversationId)
    }

    let baseMessages = messages
    if (regenerate && baseMessages[baseMessages.length - 1]?.role === 'assistant') {
      baseMessages = baseMessages.slice(0, -1)
    }

    const historySource = regenerate ? baseMessages.slice(0, -1) : messages
    const priorHistory = historySource
      .filter(
        (message) =>
          (message.role === 'user' || message.role === 'assistant') &&
          message.content.trim(),
      )
      .map((message) => ({
        role: message.role as 'user' | 'assistant',
        content: message.content,
      }))

    const optimisticUser: ChatMessage = regenerate
      ? (baseMessages[baseMessages.length - 1] ?? {
          id: temporaryId('user'),
          conversation_id: conversationId ?? 'pending',
          role: 'user',
          content: text,
          timestamp: new Date().toISOString(),
        })
      : {
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

    const nextMessages = regenerate
      ? [...baseMessages, streamingAssistant]
      : [...messages, optimisticUser, streamingAssistant]
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
          regenerate: isSignedIn && regenerate,
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

  async function handleEditLast() {
    if (status !== 'ready') return
    const index = lastIndexOfRole(messages, 'user')
    if (index < 0) return
    const lastUser = messages[index]
    const snapshot = messages
    setInput(lastUser.content)
    const next = messages.slice(0, index)
    setMessages(next)
    if (!isSignedIn) {
      if (activeId) upsertGuestThread(activeId, next)
      return
    }
    if (!activeId) return
    try {
      await rewindConversation(activeId, 'turn')
      await refreshConversations()
    } catch (err) {
      setMessages(snapshot)
      setInput('')
      setError(err instanceof Error ? err.message : 'Could not edit that question')
    }
  }

  function handleRegenerate() {
    if (status !== 'ready') return
    const index = lastIndexOfRole(messages, 'user')
    if (index < 0) return
    void sendMessage(messages[index].content, { regenerate: true })
  }

  function handleExport() {
    const markdown = threadToMarkdown(activeTitle, messages)
    downloadTextFile(`${slugifyFilename(activeTitle)}.md`, markdown)
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
        onRename={(id, title) => void handleRename(id, title)}
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
            {messages.length > 0 ? (
              <button
                type="button"
                onClick={handleExport}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--border-soft)] px-3 py-1 text-xs text-[var(--mist)] transition hover:bg-[var(--hover-on-dark)] hover:text-[var(--parchment)]"
              >
                <Download className="h-3.5 w-3.5" />
                Export
              </button>
            ) : null}
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
              messages.map((message, index) => (
                <Message key={message.id} from={message.role}>
                  <MessageContent from={message.role}>
                    {message.role === 'assistant' ? (
                      <MessageResponse content={message.content} />
                    ) : (
                      <p className="whitespace-pre-wrap">{message.content}</p>
                    )}
                  </MessageContent>
                  {status === 'ready' && message.content.trim() ? (
                    <MessageActions align={message.role === 'user' ? 'end' : 'start'}>
                      {message.role === 'assistant' ? (
                        <MessageActionButton
                          label="Copy reply"
                          copiedFeedback
                          onClick={() => void copyText(message.content)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                        </MessageActionButton>
                      ) : null}
                      {index === lastUserIndex ? (
                        <MessageActionButton
                          label="Edit question"
                          className={
                            message.role === 'user'
                              ? 'text-[var(--parchment)]/70 hover:bg-white/10 hover:text-[var(--parchment)]'
                              : undefined
                          }
                          onClick={() => void handleEditLast()}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </MessageActionButton>
                      ) : null}
                      {index === lastAssistantIndex ? (
                        <MessageActionButton
                          label="Regenerate reply"
                          onClick={handleRegenerate}
                        >
                          <RefreshCw className="h-3.5 w-3.5" />
                        </MessageActionButton>
                      ) : null}
                    </MessageActions>
                  ) : null}
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
              <p className="mt-2 px-1 text-center text-[0.68rem] leading-relaxed text-[var(--text-muted)]">
                Jude can be wrong. Check important facts.
              </p>
            </div>
          </div>
        </Conversation>
      </main>
    </div>
  )
}
