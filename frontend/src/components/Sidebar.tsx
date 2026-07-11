import { Menu, MessageSquarePlus, Trash2, X } from 'lucide-react'
import { cn, formatRelativeTime } from '../lib/utils'
import type { Conversation } from '../types'

export function Sidebar({
  conversations,
  activeId,
  open,
  onClose,
  onOpen,
  onSelect,
  onNewChat,
  onDelete,
}: {
  conversations: Conversation[]
  activeId: string | null
  open: boolean
  onClose: () => void
  onOpen: () => void
  onSelect: (id: string) => void
  onNewChat: () => void
  onDelete: (id: string) => void
}) {
  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className="fixed left-4 top-4 z-30 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-[var(--border-soft)] bg-[var(--bg-panel)] text-[var(--parchment)] backdrop-blur md:hidden"
        aria-label="Open conversations"
      >
        <Menu className="h-5 w-5" />
      </button>

      {open ? (
        <button
          type="button"
          className="fixed inset-0 z-30 bg-black/45 md:hidden"
          aria-label="Close sidebar overlay"
          onClick={onClose}
        />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-[18.5rem] flex-col border-r border-[var(--border-soft)] bg-[var(--bg-sidebar)] backdrop-blur-xl transition-transform duration-300 md:static md:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border-soft)] px-5 pb-4 pt-5">
          <div>
            <p className="font-display text-2xl font-semibold tracking-tight text-[var(--parchment)]">
              Jude
            </p>
            <p className="mt-0.5 text-xs tracking-wide text-[var(--mist)]">
              Geoscience Assistant
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--mist)] hover:bg-[var(--hover-on-dark)] md:hidden"
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
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--sandstone)] px-3 py-2.5 text-sm font-semibold text-[var(--forest)] shadow-[0_0_0_0_rgba(47,93,69,0)] transition duration-200 ease-out hover:scale-[1.02] hover:bg-[var(--sand)] hover:shadow-[0_6px_18px_rgba(47,93,69,0.32)] active:scale-[0.97] active:bg-[var(--moss)] active:text-[var(--parchment)] active:shadow-none"
          >
            <MessageSquarePlus className="h-4 w-4" />
            New chat
          </button>
        </div>

        <div className="scrollbar-thin flex-1 overflow-y-auto px-3 pb-4">
          <p className="mb-2 px-2 text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">
            Conversations
          </p>
          {conversations.length === 0 ? (
            <p className="px-2 py-6 text-sm text-[var(--text-muted)]">
              No chats yet. Ask Jude something about the world.
            </p>
          ) : (
            <ul className="space-y-1">
              {conversations.map((conversation) => {
                const active = conversation.id === activeId
                return (
                  <li key={conversation.id} className="group relative">
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(conversation.id)
                        onClose()
                      }}
                      className={cn(
                        'w-full rounded-xl px-3 py-2.5 text-left transition',
                        active
                          ? 'bg-[var(--accent-soft)] ring-1 ring-[rgba(196,165,116,0.4)]'
                          : 'hover:bg-[var(--hover-on-dark)]',
                      )}
                    >
                      <span className="line-clamp-1 pr-7 text-sm font-medium text-[var(--text-primary)]">
                        {conversation.title}
                      </span>
                      <span className="mt-0.5 block text-[0.7rem] text-[var(--text-muted)]">
                        {formatRelativeTime(conversation.updated_at)}
                      </span>
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${conversation.title}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        onDelete(conversation.id)
                      }}
                      className="absolute right-2 top-2.5 inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-muted)] opacity-0 transition hover:bg-[var(--hover-on-dark-strong)] hover:text-[var(--sand)] group-hover:opacity-100"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </aside>
    </>
  )
}
