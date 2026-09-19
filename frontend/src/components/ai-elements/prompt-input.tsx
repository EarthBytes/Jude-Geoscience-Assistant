import {
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useRef,
} from 'react'
import { ArrowUp, Square } from 'lucide-react'
import { cn } from '../../lib/utils'

export function PromptInput({
  children,
  onSubmit,
  className,
}: {
  children: ReactNode
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  className?: string
}) {
  return (
    <form
      onSubmit={onSubmit}
      className={cn(
        'prompt-shell rounded-2xl border border-[var(--border-soft)] bg-[var(--bg-panel)] p-2 backdrop-blur-md',
        className,
      )}
    >
      {children}
    </form>
  )
}

export function PromptInputTextarea({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  placeholder?: string
  disabled?: boolean
}) {
  const ref = useRef<HTMLTextAreaElement>(null)

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      onSubmit()
    }
  }

  return (
    <textarea
      ref={ref}
      value={value}
      disabled={disabled}
      rows={1}
      aria-label="Message Jude"
      placeholder={placeholder}
      onChange={(event) => {
        onChange(event.target.value)
        const el = event.target
        el.style.height = 'auto'
        el.style.height = `${Math.min(el.scrollHeight, 160)}px`
      }}
      onKeyDown={handleKeyDown}
      className="max-h-40 min-h-[48px] w-full resize-none bg-transparent px-3 py-3 text-[0.98rem] text-[var(--text-primary)] outline-none placeholder:text-[var(--text-muted)] disabled:opacity-60"
    />
  )
}

export function PromptInputFooter({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center justify-end gap-3 px-2 pb-1 pt-0">
      {children}
    </div>
  )
}

export function PromptInputSubmit({
  disabled,
  status,
  onStop,
}: {
  disabled?: boolean
  status?: 'ready' | 'streaming' | 'submitted'
  onStop?: () => void
}) {
  const busy = status === 'streaming' || status === 'submitted'
  if (busy) {
    return (
      <button
        type="button"
        onClick={onStop}
        aria-label="Stop generating"
        className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-[var(--sand)] transition hover:brightness-110"
      >
        <Square className="h-4 w-4" fill="currentColor" strokeWidth={0} />
      </button>
    )
  }
  return (
    <button
      type="submit"
      disabled={disabled}
      aria-label="Send message"
      className={cn(
        'inline-flex h-10 w-10 items-center justify-center rounded-xl transition duration-200',
        'bg-[var(--sandstone)] text-[var(--forest)] hover:brightness-110',
        'disabled:cursor-not-allowed disabled:opacity-45',
      )}
    >
      <ArrowUp className="h-5 w-5" strokeWidth={2.25} />
    </button>
  )
}
