/**
 * App — root component.
 *
 * Provider order (inner to outer):
 *   AuthProvider   — Spotify accounts (source + destination)
 *   BackupProvider — imported backup JSON (Milestone 8+)
 */

import { AuthProvider }   from './context/AuthContext'
import { BackupProvider } from './context/BackupContext'
import HomePage           from './pages/HomePage'
import CallbackPage       from './pages/CallbackPage'

function App() {
  const path = window.location.pathname

  return (
    <AuthProvider>
      <BackupProvider>
        {path === '/callback' ? <CallbackPage /> : <HomePage />}
      </BackupProvider>
    </AuthProvider>
  )
}

export default App
