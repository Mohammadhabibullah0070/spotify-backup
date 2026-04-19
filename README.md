# Spotify Backup

A modern web application that allows users to backup their Spotify playlists and liked songs, then restore them to any account. Perfect for preserving your music collection and sharing playlists across accounts.

**🌍Web Link:https://spotify-backup-1iz5.vercel.app/index.html

---

## ✨ Features

- **🔐 Secure Authentication** - OAuth2 with PKCE flow, supports multiple accounts
- **💾 Complete Backup** - Export all playlists, tracks, and liked songs to JSON
- **📁 Smart Restore** - Create playlists and restore tracks/liked songs to any Spotify account
- **📊 Results Dashboard** - View detailed statistics and logs from each restore operation
- **📥 JSON Export** - Download backup/results as JSON files for analysis
- **🎵 Playlist Management** - Create, populate, and organize playlists programmatically
- **⚡ Batch Processing** - Efficiently handle large music libraries with intelligent batching
- **📱 Responsive Design** - Works seamlessly on desktop, tablet, and mobile devices
- **🚀 Zero Setup** - No installation required, runs entirely in your browser

---

## 🛠 Tech Stack

- **Frontend:** React 18.3 + TypeScript 5.6
- **Build:** Vite 5.4 + React Plugin
- **Styling:** CSS3 (no external UI libraries)
- **API:** Spotify Web API v1 (Feb 2026)
- **Authentication:** OAuth2 with PKCE
- **Storage:** LocalStorage (tokens, user data)
- **Deployment:** Vercel

---

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ and npm
- A [Spotify Developer Account](https://developer.spotify.com/dashboard)
- Two Spotify accounts (source and destination for restore)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/Mohammadhabibullah0070/spotify-backup.git
   cd spotify-backup
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create Spotify App**
   - Go to https://developer.spotify.com/dashboard
   - Create a new application
   - Accept terms and create
   - Copy your **Client ID**

4. **Configure environment variables**
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env`:
   ```env
   VITE_SPOTIFY_CLIENT_ID=your_client_id_here
   VITE_SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000/callback
   ```

5. **Add Redirect URI to Spotify App**
   - In Spotify Dashboard, go to **Edit Settings**
   - Add to **Redirect URIs:**
     - `http://127.0.0.1:3000/callback` (for local development)
     - `https://your-deployed-url/callback` (for production)

6. **Start development server**
   ```bash
   npm run dev
   ```
   
   Open http://127.0.0.1:3000 in your browser

---

## 📖 How to Use

### Backup Flow
1. **Login** with your source Spotify account
2. **Fetch Playlists** - App retrieves all your playlists
3. **Fetch Liked Songs** - Downloads your liked songs
4. **Export Backup** - Download backup as JSON file

### Restore Flow
1. **Import Backup** - Upload your previously exported JSON backup
2. **Login to Destination Account** - Switch to the account you want to restore to
3. **Create Playlists** - Recreates all playlists in destination account
4. **Restore Tracks** - Adds all songs to their respective playlists
5. **Restore Liked Songs** - Adds liked songs to destination account's library
6. **View Results** - Check detailed statistics and success rates

### Advanced Features
- **Dual Account Support** - Keep source and destination accounts logged in simultaneously
- **Partial Restore** - Skip creating playlists, just restore tracks
- **Results Export** - Download restore results as JSON for analysis
- **Error Logging** - Detailed logs for troubleshooting failed operations

---

## 🔧 Project Structure

```
src/
├── components/          # React components
│   ├── AccountCard/     # Account display
│   ├── BackupButton/    # Backup trigger
│   ├── ImportPanel/     # Import backup dialog
│   ├── PlaylistList/    # Playlist management
│   ├── RestorePanel/    # Restore orchestration
│   ├── ResultsPanel/    # Results dashboard
│   ├── StatusPanel/     # Status indicators
│   ├── TrackList/       # Track display
│   └── layout/          # App layout
├── context/             # React Context (Auth, Backup)
├── hooks/               # Custom React hooks
│   ├── useAuth/         # Authentication
│   ├── useBackup/       # Backup operations
│   ├── usePlaylistCreator/  # M10: Create playlists
│   ├── useTrackRestorer/    # M11: Restore tracks
│   ├── useLikedSongsRestorer/ # M12: Restore liked songs
│   └── useRestoreResults/   # M13: Results aggregation
├── lib/                 # Utilities
│   ├── spotifyApi.ts    # Spotify API calls
│   ├── restoreApi.ts    # Restore operations
│   ├── resultsExport.ts # Results processing
│   └── storage.ts       # LocalStorage helpers
├── pages/               # Page components
└── styles/              # Global CSS
```


## 🔐 Security

- **No Server Storage** - All data stays in your browser
- **OAuth2 with PKCE** - Industry-standard authentication
- **Token Security** - Access tokens stored in secure storage
- **No Credentials Saved** - Passwords never handled by this app
- **Environment Variables** - Sensitive config in `.env` (never committed to git)

---

## 🚀 Deployment

### Deploy to Vercel (Recommended)
1. Push code to GitHub
2. Go to https://vercel.com
3. Import your GitHub repository
4. Add environment variables:
   - `VITE_SPOTIFY_CLIENT_ID`
   - `VITE_SPOTIFY_REDIRECT_URI`
5. Deploy (automatic on push)

### Deploy to Netlify
Similar process - import from GitHub and add environment variables.

---

## 🐛 Troubleshooting

### "redirect_uri mismatch" Error
- Ensure `VITE_SPOTIFY_REDIRECT_URI` matches exactly in:
  - `.env` file (local) or Vercel env vars (production)
  - Spotify Dashboard Redirect URIs

### "Login failed" Error
- Check browser console for detailed error
- Verify Client ID is correct
- Clear browser cookies and try again
- Ensure two different accounts are used for source/destination

### Tracks Not Restoring
- Some tracks may be unavailable in destination region
- Local files cannot be transferred (Spotify limitation)
- Check results panel for detailed failure reasons
- Download JSON report for analysis

---

## 📝 API Rate Limits

The app handles Spotify's rate limits automatically:
- Batch size: 100 tracks per request
- Delay between batches: 300ms
- Automatic retry on rate limit



## 📄 License

MIT License - see LICENSE file for details



## 📧 Support

For issues, questions, or suggestions:
1. Check existing [GitHub Issues](https://github.com/Mohammadhabibullah0070/spotify-backup/issues)
2. Create a new issue with details
3. Include browser console errors if applicable


