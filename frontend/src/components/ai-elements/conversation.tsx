import { forwardRef, type HTMLAttributes, type ReactNode } from 'react'
import { cn } from '../../lib/utils'

export function Conversation({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('relative flex min-h-0 flex-1 flex-col', className)}
      {...props}
    >
      {children}
    </div>
  )
}

export const ConversationContent = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement> & { center?: boolean }
>(function ConversationContent(
  { className, children, center = false, ...props },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn(
        'conversation-stage scrollbar-thin flex-1 overflow-y-auto px-4 py-6 sm:px-8',
        center && 'flex',
        className,
      )}
      {...props}
    >
      <div
        className={cn(
          'mx-auto flex w-full max-w-3xl flex-col gap-5',
          center && 'my-auto',
        )}
      >
        {children}
      </div>
    </div>
  )
})

export function ConversationEmptyState({
  title,
  description,
  children,
}: {
  title: string
  description: string
  children?: ReactNode
}) {
  return (
    <div className="animate-fade-up mx-auto flex max-w-xl flex-col items-center px-4 py-10 text-center">
      <div className="animate-glow-breathe mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-[var(--border-on-sand)] bg-[rgba(47,93,69,0.1)] text-[var(--moss)]">
        <svg
          viewBox="0 0 24 24"
          className="animate-globe h-8 w-8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          aria-hidden
        >
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3c2.5 2.8 3.8 5.8 3.8 9s-1.3 6.2-3.8 9c-2.5-2.8-3.8-5.8-3.8-9S9.5 5.8 12 3Z" />
        </svg>
      </div>
      <h2 className="font-display text-3xl font-semibold tracking-tight text-[var(--text-ink)] sm:text-4xl">
        {title}
      </h2>
      <p className="mt-3 max-w-md text-base leading-relaxed text-[var(--text-ink-muted)]">
        {description}
      </p>
      {children ? <div className="mt-8 w-full">{children}</div> : null}
    </div>
  )
}
