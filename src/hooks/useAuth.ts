/**
 * useAuth — convenience hook for consuming AuthContext.
 *
 * Usage:
 *   const { source, loginAs, logoutAs } = useAuth()
 *
 * Throws a helpful error if used outside of <AuthProvider>.
 */

import { useContext } from 'react'
import { AuthContext, type AuthContextValue } from '../context/AuthContext'

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) {
    throw new Error('useAuth() must be called inside <AuthProvider>.')
  }
  return ctx
}
