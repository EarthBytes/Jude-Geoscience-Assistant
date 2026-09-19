import {
  Menu,
  MessageSquarePlus,
  NotebookPen,
  Pencil,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { cn, formatRelativeTime } from '../lib/utils'
import type { Conversation } from '../types'

const MEMORY_LIMIT = 4000

export function Sidebar({
  conversations,
  activeId,
  open,
  memory,
  isSignedIn,
  onMemoryChange,
  onClose,
  onOpen,
  onSelect,
  onNewChat,
  onDelete,
  onRename,
}: {
  conversations: Conversation[]
  activeId: string | null
  open: boolean
  memory: string
  isSignedIn: boolean
  onMemoryChange: (value: string) => void
  onClose: () => void
  onOpen: () => void
  onSelect: (id: string) => void
  onNewChat: () => void
  onDelete: (id: string) => void
  onRename: (id: string, title: string) => void
}) {
  const [notesOpen, setNotesOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [draftTitle, setDraftTitle] = useState('')
  const [pendingDelete, setPendingDelete] = useState<Conversation | null>(null)
  const notesRef = useRef<HTMLTextAreaElement>(null)
  const renameRef = useRef<HTMLInputElement>(null)
  const hasNotes = Boolean(memory.trim())

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return conversations
    return conversations.filter((conversation) =>
      conversation.title.toLowerCase().includes(needle),
    )
  }, [conversations, query])

  useEffect(() => {
    if (!open && !notesOpen && !pendingDelete) return
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      if (pendingDelete) {
        setPendingDelete(null)
        return
      }
      if (notesOpen) {
        setNotesOpen(false)
        return
      }
      if (renamingId) {
        setRenamingId(null)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, notesOpen, pendingDelete, renamingId, onClose])

  useEffect(() => {
    if (!notesOpen) return
    notesRef.current?.focus()
  }, [notesOpen])

  useEffect(() => {
    if (!renamingId) return
    renameRef.current?.focus()
    renameRef.current?.select()
  }, [renamingId])

  function startRename(conversation: Conversation) {
    setRenamingId(conversation.id)
    setDraftTitle(conversation.title)
  }

  function commitRename() {
    if (!renamingId) return
    const next = draftTitle.trim()
    const current = conversations.find((item) => item.id === renamingId)
    setRenamingId(null)
    if (!next || !current || next === current.title) return
    onRename(renamingId, next)
  }

  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        aria-expanded={open}
        aria-controls="conversation-sidebar"
        className="fixed left-4 top-4 z-30 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[var(--bg-panel)] text-[var(--parchment)] backdrop-blur transition hover:bg-[var(--hover-on-dark)] md:hidden"
        aria-label="Open conversations"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open ? (
        <button
          type="button"
          className="animate-fade-in fixed inset-0 z-30 bg-black/45 md:hidden"
          aria-label="Close sidebar overlay"
          onClick={onClose}
        />
      ) : null}

      <aside
        id="conversation-sidebar"
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[18.5rem] flex-col border-r border-[var(--border-soft)] bg-[var(--bg-sidebar)] backdrop-blur-xl transition-transform duration-300 ease-out md:static md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-soft)] px-5 pb-5 pt-6">
          <div>
            <p className="font-display text-2xl font-semibold tracking-tight text-[var(--parchment)]">
              Jude
            </p>
            <p className="mt-1 text-xs tracking-[0.16em] uppercase text-[var(--mist)]">
              Geoscience Assistant
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--mist)] transition hover:bg-[var(--hover-on-dark)] md:hidden"
            aria-label="Close sidebar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="px-4 py-4">
          <button
            type="button"
            onClick={() => {
              onNewChat()
              onClose()
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--sandstone)] px-3 py-2.5 text-sm font-semibold text-[var(--forest)] transition duration-200 ease-out hover:scale-[1.015] hover:bg-[var(--sand)] active:scale-[0.98] active:bg-[var(--moss)] active:text-[var(--parchment)]"
          >
            <MessageSquarePlus className="h-4 w-4" />
            New chat
          </button>
          <label className="relative mt-3 block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search chats"
              aria-label="Search chats"
              className="w-full rounded-xl border border-[var(--border-soft)] bg-[var(--hover-on-dark)] py-2 pl-9 pr-3 text-sm text-[var(--parchment)] outline-none placeholder:text-[var(--text-muted)] focus:border-[rgba(196,165,116,0.45)]"
            />
          </label>
        </div>

        <div className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-5">
          <p className="mb-2 px-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            Conversations
          </p>
          {conversations.length === 0 ? (
            <p className="px-2 py-6 text-sm leading-relaxed text-[var(--text-muted)]">
              No chats yet. Ask Jude something about the world.
            </p>
          ) : filtered.length === 0 ? (
            <p className="px-2 py-6 text-sm leading-relaxed text-[var(--text-muted)]">
              No chats match “{query.trim()}”.
            </p>
          ) : (
            <ul className="space-y-1">
              {filtered.map((conversation) => {
                const active = conversation.id === activeId
                const renaming = renamingId === conversation.id
                return (
                  <li key={conversation.id} className="group relative">
                    {renaming ? (
                      <form
                        className="rounded-xl bg-[var(--accent-soft)] px-3 py-2 ring-1 ring-[rgba(196,165,116,0.4)]"
                        onSubmit={(event) => {
                          event.preventDefault()
                          commitRename()
                        }}
                      >
                        <input
                          ref={renameRef}
                          value={draftTitle}
                          onChange={(event) => setDraftTitle(event.target.value)}
                          onBlur={commitRename}
                          maxLength={200}
                          aria-label="Conversation title"
                          className="w-full bg-transparent text-sm font-medium text-[var(--text-primary)] outline-none"
                        />
                      </form>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            onSelect(conversation.id)
                            onClose()
                          }}
                          className={cn(
                            'w-full rounded-xl px-3 py-2.5 text-left transition-colors duration-150',
                            active
                              ? 'bg-[var(--accent-soft)] ring-1 ring-[rgba(196,165,116,0.4)]'
                              : 'hover:bg-[var(--hover-on-dark)]',
                          )}
                        >
                          <span className="line-clamp-1 pr-14 text-sm font-medium text-[var(--text-primary)]">
                            {conversation.title}
                          </span>
                          <span className="mt-0.5 block text-[0.7rem] text-[var(--text-muted)]">
                            {formatRelativeTime(conversation.updated_at)}
                          </span>
                        </button>
                        <div className="absolute right-1.5 top-2 flex items-center gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                          <button
                            type="button"
                            aria-label={`Rename ${conversation.title}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              startRename(conversation)
                            }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--hover-on-dark-strong)] hover:text-[var(--sand)]"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete ${conversation.title}`}
                            onClick={(event) => {
                              event.stopPropagation()
                              setPendingDelete(conversation)
                            }}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--hover-on-dark-strong)] hover:text-[var(--sand)]"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-[var(--border-soft)] px-4 py-4">
          <button
            type="button"
            onClick={() => setNotesOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={notesOpen}
            className="flex w-full items-center gap-2.5 rounded-xl border border-[var(--border-soft)] px-3 py-2.5 text-left transition hover:bg-[var(--hover-on-dark)]"
          >
            <NotebookPen className="h-4 w-4 shrink-0 text-[var(--sandstone)]" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-[var(--parchment)]">
                Notes for Jude
              </span>
              <span className="mt-0.5 block truncate text-[0.7rem] text-[var(--text-muted)]">
                {hasNotes ? memory : 'Add standing notes'}
              </span>
            </span>
            {hasNotes ? (
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--sandstone)]" />
            ) : null}
          </button>
        </div>
      </aside>

      {notesOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="animate-fade-in absolute inset-0 bg-black/55"
            aria-label="Close notes"
            onClick={() => setNotesOpen(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="jude-memory-title"
            className="animate-fade-up relative w-full max-w-md rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-5 shadow-2xl"
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <h2
                  id="jude-memory-title"
                  className="font-display text-xl font-semibold text-[var(--parchment)]"
                >
                  Notes for Jude
                </h2>
                <p className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
                  {isSignedIn
                    ? 'Jude will remember this across all your chats.'
                    : 'Jude will remember this for this tab only, until you sign in.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setNotesOpen(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--mist)] transition hover:bg-[var(--hover-on-dark)]"
                aria-label="Close notes"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <textarea
              ref={notesRef}
              id="jude-memory"
              value={memory}
              maxLength={MEMORY_LIMIT}
              onChange={(event) => onMemoryChange(event.target.value)}
              className="min-h-[10rem] w-full resize-none rounded-xl border border-[var(--border-soft)] bg-[var(--hover-on-dark)] px-3 py-2.5 text-sm leading-relaxed text-[var(--parchment)] outline-none placeholder:text-[var(--text-muted)] focus:border-[rgba(196,165,116,0.45)]"
            />
            <p className="mt-2 text-right text-[0.68rem] tabular-nums text-[var(--text-muted)]">
              {memory.length}/{MEMORY_LIMIT}
            </p>
          </div>
        </div>
      ) : null}

      {pendingDelete ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <button
            type="button"
            className="animate-fade-in absolute inset-0 bg-black/55"
            aria-label="Cancel delete"
            onClick={() => setPendingDelete(null)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-chat-title"
            className="animate-fade-up relative w-full max-w-sm rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-elevated)] p-5 shadow-2xl"
          >
            <h2
              id="delete-chat-title"
              className="font-display text-xl font-semibold text-[var(--parchment)]"
            >
              Delete this chat?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--mist)]">
              “{pendingDelete.title}” will be removed
              {isSignedIn ? ' from your account' : ' from this tab'}.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPendingDelete(null)}
                className="rounded-xl px-3 py-2 text-sm text-[var(--mist)] transition hover:bg-[var(--hover-on-dark)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  onDelete(pendingDelete.id)
                  setPendingDelete(null)
                }}
                className="rounded-xl bg-red-900/70 px-3 py-2 text-sm font-semibold text-red-50 transition hover:bg-red-800"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  )
}
