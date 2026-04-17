import React from 'react'
import './AppLayout.css'

interface AppLayoutProps {
  children: React.ReactNode
}

function AppLayout({ children }: AppLayoutProps) {
  return (
    <div className="app-layout">
      <header className="app-header">
        <div className="app-header__inner">
          <svg
            className="app-header__logo"
            viewBox="0 0 32 32"
            aria-label="Spotify Backup logo"
            width="32"
            height="32"
          >
            <circle cx="16" cy="16" r="16" fill="#1DB954" />
            <path
              d="M22 11.5c-3.3-2-8.8-2.2-12-1.2-.5.2-1-.1-1.2-.6s.1-1 .6-1.2
                 c3.6-1.1 9.7-.9 13.5 1.4.5.3.6.9.3 1.4-.3.4-.9.5-1.2.2z
                 M21.9 14.8c-.3.4-.8.5-1.2.3-2.8-1.7-7-2.2-10.2-1.2
                 -.4.1-.9-.1-1-.5-.1-.4.1-.9.5-1 3.7-1.1 8.3-.6 11.5 1.4.4.2.5.7.4 1z
                 M20.5 18c-.2.3-.6.4-1 .3-2.4-1.5-5.5-1.8-9-.9-.3.1-.7-.1-.8-.5
                 -.1-.3.1-.7.5-.8 3.9-1 7.4-.6 10.1 1.1.3.1.4.5.2.8z"
              fill="white"
            />
          </svg>
          <span className="app-header__title">SpotifyBackup</span>
        </div>
      </header>

      <main className="app-main">
        <div className="app-main__inner">{children}</div>
      </main>

      <footer className="app-footer">
        <p>SpotifyBackup — Not affiliated with Spotify AB.</p>
      </footer>
    </div>
  )
}

export default AppLayout
