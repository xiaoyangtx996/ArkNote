import { useState, useEffect, useCallback, useRef } from 'react'
import { NOTE_THEMES, type NoteThemeId } from '@/lib/note-themes'
import { loadNotes, saveNotes, type Note } from '@/lib/note-storage'
import { formatSavedTime } from '@/lib/format-time'

export { formatSavedTime }

function getDefaultNoteScreenPosition(id: number) {
  const offset = (id % 8) * 28
  const width = window.screen?.availWidth ?? 1920
  const height = window.screen?.availHeight ?? 1080
  return {
    x: Math.max(40, width / 2 - 150 + offset),
    y: Math.max(40, height / 2 - 100 + offset),
  }
}

function createNote(id: number): Note {
  return {
    id,
    title: `便签 #${id}`,
    content: '',
    position: getDefaultNoteScreenPosition(id),
    size: { width: 300, height: 400 },
    isPinned: false,
    theme: 'business',
    isPreview: false,
  }
}

function hasNoteContent(note: Note): boolean {
  return note.content.trim().length > 0
}

function initNotesState() {
  const stored = loadNotes()
  const notes = stored && stored.notes.length > 0 ? stored.notes : [createNote(1)]
  const closedNotes = stored?.closedNotes ?? []
  const savedAtMap = stored?.savedAtMap ?? {}
  const allIds = [...notes, ...closedNotes].map(note => note.id)
  return {
    notes,
    closedNotes,
    savedAtMap,
    nextId: allIds.length > 0 ? Math.max(...allIds) + 1 : 2,
  }
}

export function useNotes() {
  const initialStateRef = useRef<ReturnType<typeof initNotesState>>()
  if (initialStateRef.current === undefined) {
    initialStateRef.current = initNotesState()
  }
  const initial = initialStateRef.current

  const [notes, setNotes] = useState<Note[]>(initial.notes)
  const [closedNotes, setClosedNotes] = useState<Note[]>(initial.closedNotes)
  const [savedAtMap, setSavedAtMap] = useState<Record<number, number>>(initial.savedAtMap)
  const nextIdRef = useRef(initial.nextId)
  const isInitialMount = useRef(true)
  const prevNotesRef = useRef(notes)
  const notesRef = useRef(notes)
  const closedNotesRef = useRef(closedNotes)
  notesRef.current = notes
  closedNotesRef.current = closedNotes

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false
      prevNotesRef.current = notes
      return
    }

    const timer = window.setTimeout(() => {
      const prev = prevNotesRef.current
      const changedIds = notes
        .filter(note => {
          const old = prev.find(item => item.id === note.id)
          return !old || JSON.stringify(old) !== JSON.stringify(note)
        })
        .map(note => note.id)

      setSavedAtMap(current => {
        const activeIds = new Set([
          ...notes.map(note => note.id),
          ...closedNotesRef.current.map(note => note.id),
        ])
        const pruned = Object.fromEntries(
          Object.entries(current).filter(([id]) => activeIds.has(Number(id))),
        ) as Record<number, number>

        const next = changedIds.length === 0 ? pruned : { ...pruned }
        if (changedIds.length > 0) {
          const now = Date.now()
          changedIds.forEach(id => {
            next[id] = now
          })
        }

        saveNotes(notes, next, closedNotesRef.current)
        return next
      })

      prevNotesRef.current = notes
    }, 500)

    return () => window.clearTimeout(timer)
  }, [notes, closedNotes])

  const handleNewNote = useCallback((): number => {
    let newId = nextIdRef.current
    setNotes(prev => {
      newId = prev.length > 0 ? Math.max(...prev.map(n => n.id)) + 1 : nextIdRef.current
      nextIdRef.current = newId + 1
      return [...prev, createNote(newId)]
    })
    return newId
  }, [])

  const handleNoteUpdate = useCallback((noteId: number, updates: Partial<Note>) => {
    setNotes(prev =>
      prev.map(note => (note.id === noteId ? { ...note, ...updates } : note)),
    )
  }, [])

  const handleNoteClose = useCallback((noteId: number) => {
    const note = notesRef.current.find(item => item.id === noteId)
    if (!note) return

    setNotes(prev => prev.filter(item => item.id !== noteId))

    if (hasNoteContent(note)) {
      setClosedNotes(prev => [note, ...prev.filter(item => item.id !== noteId)])
    } else {
      setSavedAtMap(current => {
        const next = { ...current }
        delete next[noteId]
        return next
      })
    }
  }, [])

  const handleRestoreNote = useCallback((noteId: number): boolean => {
    const note = closedNotesRef.current.find(item => item.id === noteId)
    if (!note) return false

    setClosedNotes(prev => prev.filter(item => item.id !== noteId))
    setNotes(prev => [...prev, note])
    return true
  }, [])

  const handleDeleteClosedNote = useCallback((noteId: number) => {
    setClosedNotes(prev => prev.filter(item => item.id !== noteId))
    setSavedAtMap(current => {
      const next = { ...current }
      delete next[noteId]
      return next
    })
  }, [])

  const handleApplyAllTheme = useCallback((themeId: NoteThemeId) => {
    setNotes(prev => prev.map(note => ({ ...note, theme: themeId })))
  }, [])

  const handleCycleNoteTheme = useCallback(() => {
    setNotes(prev => {
      if (prev.length === 0) return prev
      const currentIdx = NOTE_THEMES.findIndex(theme => theme.id === prev[0].theme)
      const nextTheme = NOTE_THEMES[(currentIdx + 1 + NOTE_THEMES.length) % NOTE_THEMES.length].id
      return prev.map(note => ({ ...note, theme: nextTheme }))
    })
  }, [])

  const handleSaveNow = useCallback((noteId: number) => {
    setSavedAtMap(current => {
      const now = Date.now()
      const next = { ...current, [noteId]: now }
      saveNotes(notesRef.current, next, closedNotesRef.current)
      return next
    })
  }, [])

  return {
    notes,
    closedNotes,
    savedAtMap,
    handleNewNote,
    handleNoteUpdate,
    handleNoteClose,
    handleRestoreNote,
    handleDeleteClosedNote,
    handleApplyAllTheme,
    handleCycleNoteTheme,
    handleSaveNow,
  }
}
