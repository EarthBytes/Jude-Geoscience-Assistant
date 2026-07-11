import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import 'katex/dist/katex.min.css'
import { cn } from '../../lib/utils'
import type { MessageRole } from '../../types'

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
  return (
    <div
      className={cn(
        'animate-fade-up flex w-full',
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
        'rounded-2xl px-4 py-3 text-[0.95rem] leading-relaxed',
        isUser
          ? 'rounded-br-md bg-[var(--bg-user)] text-[var(--parchment)] shadow-[0_6px_20px_rgba(7,20,16,0.16)]'
          : 'rounded-bl-md border border-[var(--border-on-sand)] bg-[var(--bg-assistant)] text-[var(--text-ink)] shadow-[0_4px_18px_rgba(26,32,28,0.08)]',
        className,
      )}
    >
      {children}
    </div>
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
    <div className="prose-jude">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        >
        {content}
        </ReactMarkdown>
    </div>
  )
}
