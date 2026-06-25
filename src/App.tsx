import { useEffect, useRef, useState, useCallback } from 'react'
import { NoteWindow } from './components/note-window'
import { ThemeProvider } from './components/theme-provider'
import { useNotes } from './hooks/use-notes'

function AppContent() {
  const {
    notes,
    closedNotes,
    savedAtMap,
    handleNewNote,
    handleNoteUpdate,
    handleNoteClose,
    handleRestoreNote,
    handleDeleteClosedNote,
    handleSaveNow,
  } = useNotes()
  const [noteZIndexes, setNoteZIndexes] = useState<Record<number, number>>({})
  const zCounterRef = useRef(0)

  const bringNoteToFront = useCallback((noteId: number) => {
    zCounterRef.current += 1
    setNoteZIndexes(prev => ({ ...prev, [noteId]: zCounterRef.current }))
  }, [])

  const createAndFocusNote = useCallback(() => {
    const id = handleNewNote()
    bringNoteToFront(id)
  }, [handleNewNote, bringNoteToFront])

  const handleRestoreClosedNote = useCallback(
    (noteId: number) => {
      if (handleRestoreNote(noteId)) {
        bringNoteToFront(noteId)
      }
    },
    [handleRestoreNote, bringNoteToFront],
  )

  useEffect(() => {
    setNoteZIndexes(prev => {
      const next = { ...prev }
      let changed = false
      const activeIds = new Set(notes.map(note => note.id))

      for (const id of Object.keys(next)) {
        if (!activeIds.has(Number(id))) {
          delete next[Number(id)]
          changed = true
        }
      }

      for (const note of notes) {
        if (next[note.id] === undefined) {
          zCounterRef.current += 1
          next[note.id] = zCounterRef.current
          changed = true
        }
      }

      return changed ? next : prev
    })
  }, [notes])

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-gray-100">
      {notes.map(note => (
        <NoteWindow
          key={note.id}
          note={note}
          zIndex={(note.isPinned ? 10000 : 0) + (noteZIndexes[note.id] ?? 1)}
          savedAt={savedAtMap[note.id]}
          closedNotes={closedNotes}
          onActivate={() => bringNoteToFront(note.id)}
          onUpdate={updates => handleNoteUpdate(note.id, updates)}
          onClose={() => handleNoteClose(note.id)}
          onSaveNow={() => handleSaveNow(note.id)}
          onRestoreNote={handleRestoreClosedNote}
          onDeleteClosedNote={handleDeleteClosedNote}
          onNewNote={createAndFocusNote}
        />
      ))}
      <button
        type="button"
        className="fixed bottom-4 right-4 z-[10000] rounded-md border bg-white px-3 py-2 text-sm shadow-md hover:bg-gray-50"
        onClick={createAndFocusNote}
      >
        新建便签（浏览器预览）
      </button>
    </div>
  )
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  )
}

export default App
