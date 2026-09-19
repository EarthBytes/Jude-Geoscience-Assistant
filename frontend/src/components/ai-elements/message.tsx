import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react'
import { Check } from 'lucide-react'
import { cn } from '../../lib/utils'
import type { MessageRole } from '../../types'

const RichMessageResponse = lazy(() =>
  import('./rich-message-response').then((module) => ({
    default: module.RichMessageResponse,
  })),
)

export function Message({
  from,
  children,
  className,
}: {
  from: MessageRole
  children: ReactNode
  className?: string
}) {
  const isUser = from === 'user'
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [])

  return (
    <div
      className={cn(
        'group/message flex w-full',
        entered ? 'animate-message-in' : 'message-enter',
        isUser ? 'justify-end' : 'justify-start',
        className,
      )}
    >
      <div
        className={cn(
          'max-w-[92%] sm:max-w-[85%]',
          isUser ? 'items-end' : 'items-start',
        )}
      >
        {!isUser ? (
          <div className="mb-1.5 ml-1 font-display text-xs font-medium tracking-wide text-[var(--moss)]">
            Jude
          </div>
        ) : null}
        {children}
      </div>
    </div>
  )
}

export function MessageContent({
  from,
  children,
  className,
}: {
  from: MessageRole
  children: ReactNode
  className?: string
}) {
  const isUser = from === 'user'
  return (
    <div
      className={cn(
        'select-text rounded-2xl px-4 py-3 text-[0.95rem] leading-relaxed transition-shadow duration-300',
        isUser
          ? 'rounded-br-md bg-[var(--bg-user)] text-[var(--parchment)]'
          : 'rounded-bl-md border border-[var(--border-on-sand)] bg-[var(--bg-assistant)] text-[var(--text-ink)]',
        className,
      )}
    >
      {children}
    </div>
  )
}

export function MessageActions({
  align = 'start',
  children,
}: {
  align?: 'start' | 'end'
  children: ReactNode
}) {
  return (
    <div
      className={cn(
        'mt-1 flex items-center gap-0.5 opacity-100 transition-opacity duration-150 md:opacity-0 md:group-hover/message:opacity-100 md:group-focus-within/message:opacity-100',
        align === 'end' ? 'justify-end' : 'justify-start',
      )}
    >
      {children}
    </div>
  )
}

export function MessageActionButton({
  label,
  copiedFeedback = false,
  className,
  onClick,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string
  copiedFeedback?: boolean
  children: ReactNode
}) {
  const [copied, setCopied] = useState(false)

  return (
    <button
      type="button"
      aria-label={copied ? 'Copied' : label}
      title={copied ? 'Copied' : label}
      onClick={async (event) => {
        await onClick?.(event)
        if (!copiedFeedback) return
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1400)
      }}
      className={cn(
        'inline-flex h-7 w-7 items-center justify-center rounded-lg text-[var(--text-ink-muted)] transition hover:bg-black/10 hover:text-[var(--text-ink)]',
        className,
      )}
      {...props}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : children}
    </button>
  )
}

export function MessageResponse({ content }: { content: string }) {
  if (!content) {
    return (
      <span className="inline-flex items-center gap-1 text-[var(--text-ink-muted)]">
        <span className="animate-pulse-soft h-1.5 w-1.5 rounded-full bg-[var(--moss)]" />
        <span className="animate-pulse-soft h-1.5 w-1.5 rounded-full bg-[var(--moss)] [animation-delay:150ms]" />
        <span className="animate-pulse-soft h-1.5 w-1.5 rounded-full bg-[var(--moss)] [animation-delay:300ms]" />
      </span>
    )
  }

  return (
    <Suspense fallback={<p className="whitespace-pre-wrap">{content}</p>}>
      <RichMessageResponse content={content} />
    </Suspense>
  )
}
