/**
 * App — root component.
 * Provider order: AuthProvider > BackupProvider.
 */

import { AuthProvider } from "./context/AuthContext";
import { BackupProvider } from "./context/BackupContext";
import HomePage from "./pages/HomePage";
import CallbackPage from "./pages/CallbackPage";

export default function App() {
  return (
    <AuthProvider>
      <BackupProvider>
        {window.location.pathname === "/callback" ? (
          <CallbackPage />
        ) : (
          <HomePage />
        )}
      </BackupProvider>
    </AuthProvider>
  );
}
