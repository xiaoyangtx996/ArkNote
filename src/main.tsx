import React from 'react'
import ReactDOM from 'react-dom/client'
import { getCurrentWindow } from '@tauri-apps/api/window'
import App from './App'
import { AboutApp } from './AboutApp'
import { NoteApp } from './NoteApp'
import { isTauri } from './lib/tauri'
import './index.css'

function Root() {
  // Desktop: each webview is a single note window (Rust-backed).
  // Browser: fall through to App (localStorage preview only).
  if (isTauri()) {
    const label = getCurrentWindow().label
    if (label === 'about') {
      return <AboutApp />
    }
    if (label.startsWith('note-')) {
      const noteId = Number.parseInt(label.slice(5), 10)
      if (!Number.isNaN(noteId)) {
        return <NoteApp noteId={noteId} />
      }
    }
  }

  return <App />
}

ReactDOM.createRoot(document.getElementById('root')!).render(<Root />)
