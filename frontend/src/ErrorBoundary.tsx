import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Jude UI crashed', error, info.componentStack)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="flex h-full items-center justify-center bg-[var(--bg-deep)] px-6 text-center">
          <div className="max-w-md">
            <p className="font-display text-2xl text-[var(--parchment)]">
              Something went wrong
            </p>
            <p className="mt-2 text-sm text-[var(--mist)]">
              Reload the page to keep chatting with Jude.
            </p>
            <button
              type="button"
              className="mt-5 rounded-xl bg-[var(--sandstone)] px-4 py-2 text-sm font-semibold text-[var(--forest)]"
              onClick={() => window.location.reload()}
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
