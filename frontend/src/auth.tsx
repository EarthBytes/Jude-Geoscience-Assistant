import {
  Show,
  SignInButton,
  SignUpButton,
  UserButton,
  useAuth,
} from '@clerk/react'
import {
  createContext,
  useContext,
  useMemo,
  type ReactNode,
} from 'react'

/* Hooks and session types live next to the provider on purpose. */
/* oxlint-disable react/only-export-components */

export type Session = {
  isLoaded: boolean
  isSignedIn: boolean
  userId: string | null
  clerkEnabled: boolean
  getToken: () => Promise<string | null>
}

const AuthContext = createContext<Session | null>(null)

function ClerkSessionBridge({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn, userId, getToken } = useAuth()
  const value = useMemo<Session>(
    () => ({
      isLoaded,
      isSignedIn: Boolean(isSignedIn),
      userId: userId ?? null,
      clerkEnabled: true,
      getToken: () => getToken(),
    }),
    [getToken, isLoaded, isSignedIn, userId],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function AuthProvider({ children }: { children: ReactNode }) {
  return <ClerkSessionBridge>{children}</ClerkSessionBridge>
}

export function useSession() {
  const session = useContext(AuthContext)
  if (!session) {
    throw new Error('useSession must be used within AuthProvider')
  }
  return session
}

const ghostButtonClass =
  'rounded-lg border border-[var(--border-soft)] px-3 py-1.5 text-xs font-semibold text-[var(--parchment)] transition hover:bg-[var(--hover-on-dark)]'

const primaryButtonClass =
  'rounded-lg bg-[var(--sandstone)] px-3 py-1.5 text-xs font-semibold text-[var(--forest)] transition hover:brightness-110'

export function AuthControls() {
  return (
    <div className="flex items-center gap-2">
      <Show when="signed-out">
        <SignInButton mode="modal">
          <button type="button" className={ghostButtonClass}>
            Sign in
          </button>
        </SignInButton>
        <SignUpButton mode="modal">
          <button type="button" className={primaryButtonClass}>
            Sign up
          </button>
        </SignUpButton>
      </Show>
      <Show when="signed-in">
        <UserButton />
      </Show>
    </div>
  )
}
