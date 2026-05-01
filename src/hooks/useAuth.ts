/**
 * useAuth — convenience hook for consuming AuthContext.
 * Throws error if used outside <AuthProvider>.
 */

import { useContext } from "react";
import { AuthContext, type AuthContextValue } from "../context/AuthContext";

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() must be called inside <AuthProvider>.");
  return ctx;
}
