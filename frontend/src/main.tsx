import { ClerkProvider } from '@clerk/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AuthProvider } from './auth.tsx'
import { ErrorBoundary } from './ErrorBoundary.tsx'

const root = document.getElementById('root')
if (!root) {
  throw new Error('Root element not found')
}

const clerkAppearance = {
  variables: {
    colorPrimary: '#2f5d45',
    colorBackground: '#faf6ef',
    colorText: '#1a201c',
    colorTextSecondary: '#4f5c56',
    colorInputBackground: '#f3ece2',
    colorInputText: '#1a201c',
    borderRadius: '0.8rem',
    fontFamily: 'Figtree, ui-sans-serif, sans-serif',
  },
}

createRoot(root).render(
  <StrictMode>
    <ClerkProvider afterSignOutUrl="/" appearance={clerkAppearance}>
      <ErrorBoundary>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ErrorBoundary>
    </ClerkProvider>
  </StrictMode>,
)

