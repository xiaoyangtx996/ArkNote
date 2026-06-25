import React from 'react'
import ReactDOM from 'react-dom/client'
import { getCurrentWindow } from '@tauri-apps/api/window'
import App from './App'
import { NoteApp } from './NoteApp'
import { isTauri } from './lib/tauri'
import './index.css'

function Root() {
  if (isTauri()) {
    const label = getCurrentWindow().label
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
