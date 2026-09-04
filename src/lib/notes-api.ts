/**
 * Notes state API.
 *
 * Desktop (Tauri): Rust `NotesStore` is authoritative; this module keeps a
 * per-webview cache hydrated via `load_notes_cmd` / `notes-changed`.
 * Browser preview (`npm run dev`): localStorage only — not shared with desktop.
 */
import {
  hasNoteContent,
  loadNotes,
  saveNotes,
  normalizeNote,
  type Note,
  type StoredNotes,
} from '@/lib/note-storage'
import { isTauri } from '@/lib/tauri'
import { invoke } from '@tauri-apps/api/core'

export type NotesState = {
  notes: Note[]
  closedNotes: Note[]
  savedAtMap: Record<number, number>
  nextId: number
}

function emptyState(): NotesState {
  return { notes: [], closedNotes: [], savedAtMap: {}, nextId: 1 }
}

function computeNextId(notes: Note[], closedNotes: Note[]): number {
  const allIds = [...notes, ...closedNotes].map(note => note.id)
  return allIds.length > 0 ? Math.max(...allIds) + 1 : 1
}

function toState(data: Pick<StoredNotes, 'notes' | 'savedAtMap' | 'closedNotes'>): NotesState {
  const notes = data.notes.map(normalizeNote)
  const closedNotes = (data.closedNotes ?? []).map(normalizeNote)
  const savedAtMap = data.savedAtMap ?? {}
  return { notes, closedNotes, savedAtMap, nextId: computeNextId(notes, closedNotes) }
}

let cache: NotesState = emptyState()

export async function hydrateNotesFromRust(): Promise<boolean> {
  if (!isTauri()) return false
  try {
    const data = await invoke<StoredNotes>('load_notes_cmd')
    cache = toState(data)
    return true
  } catch (error) {
    console.error('[notes] load failed:', error)
    return false
  }
}

export function readNotesState(): NotesState {
  if (isTauri()) {
    return cache
  }
  const stored = loadNotes()
  const notes = stored?.notes ?? []
  const closedNotes = stored?.closedNotes ?? []
  const savedAtMap = stored?.savedAtMap ?? {}
  return { notes, closedNotes, savedAtMap, nextId: computeNextId(notes, closedNotes) }
}

function mergeNoteInCache(noteId: number, updates: Partial<Note>) {
  const state = readNotesState()
  const nextNotes = state.notes.map(note =>
    note.id === noteId ? normalizeNote({ ...note, ...updates }) : note,
  )
  cache = { ...state, notes: nextNotes }
  return cache
}

function toNotePatch(updates: Partial<Note>): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  if (updates.title !== undefined) patch.title = updates.title
  if (updates.content !== undefined) patch.content = updates.content
  if (updates.position !== undefined) patch.position = updates.position
  if (updates.size !== undefined) patch.size = updates.size
  if (updates.isPinned !== undefined) patch.isPinned = updates.isPinned
  if (updates.theme !== undefined) patch.theme = updates.theme
  if (updates.isPreview !== undefined) patch.isPreview = updates.isPreview
  return patch
}

function isEditorialPatch(updates: Partial<Note>): boolean {
  return (
    updates.content !== undefined ||
    updates.title !== undefined ||
    updates.theme !== undefined ||
    updates.isPreview !== undefined
  )
}

export async function patchNoteInStore(noteId: number, updates: Partial<Note>): Promise<NotesState> {
  const patch = toNotePatch(updates)
  if (isTauri()) {
    await invoke('patch_note_cmd', { noteId, patch })
    mergeNoteInCache(noteId, updates)
    if (isEditorialPatch(updates)) {
      cache = {
        ...cache,
        savedAtMap: { ...cache.savedAtMap, [noteId]: Date.now() },
      }
    }
    return cache
  }
  const state = readNotesState()
  const nextNotes = state.notes.map(note =>
    note.id === noteId ? normalizeNote({ ...note, ...updates }) : note,
  )
  const next = {
    ...state,
    notes: nextNotes,
    savedAtMap: isEditorialPatch(updates)
      ? { ...state.savedAtMap, [noteId]: Date.now() }
      : state.savedAtMap,
  }
  saveNotes(next.notes, next.savedAtMap, next.closedNotes)
  return next
}

export function updateNoteInStore(noteId: number, updates: Partial<Note>): NotesState {
  if (isTauri()) {
    void patchNoteInStore(noteId, updates)
    return mergeNoteInCache(noteId, updates)
  }
  const state = readNotesState()
  const nextNotes = state.notes.map(note =>
    note.id === noteId ? normalizeNote({ ...note, ...updates }) : note,
  )
  const next = { ...state, notes: nextNotes }
  saveNotes(next.notes, next.savedAtMap, next.closedNotes)
  return next
}

export async function closeNoteInStoreAsync(noteId: number): Promise<NotesState> {
  if (isTauri()) {
    await invoke('close_note_data_cmd', { noteId })
    return readNotesState()
  }
  return closeNoteInStore(noteId)
}

export function closeNoteInStore(noteId: number): NotesState {
  const state = readNotesState()
  const note = state.notes.find(item => item.id === noteId)
  if (!note) return state

  const notes = state.notes.filter(item => item.id !== noteId)
  let closedNotes = state.closedNotes
  let savedAtMap = state.savedAtMap

  if (hasNoteContent(note)) {
    closedNotes = [note, ...closedNotes.filter(item => item.id !== noteId)]
  } else {
    const next = { ...savedAtMap }
    delete next[noteId]
    savedAtMap = next
  }

  const next = { ...state, notes, closedNotes, savedAtMap }
  if (!isTauri()) {
    saveNotes(next.notes, next.savedAtMap, next.closedNotes)
  }
  cache = next
  return next
}

export async function restoreNoteInStoreAsync(noteId: number): Promise<Note | null> {
  if (isTauri()) {
    await invoke('restore_note_cmd', { noteId })
    await hydrateNotesFromRust()
    return readNotesState().notes.find(note => note.id === noteId) ?? null
  }
  return restoreNoteInStore(noteId)
}

export function restoreNoteInStore(noteId: number): Note | null {
  const state = readNotesState()
  const note = state.closedNotes.find(item => item.id === noteId)
  if (!note) return null

  const next = {
    ...state,
    closedNotes: state.closedNotes.filter(item => item.id !== noteId),
    notes: [...state.notes, note],
  }
  if (!isTauri()) {
    saveNotes(next.notes, next.savedAtMap, next.closedNotes)
  }
  cache = next
  return note
}

export async function deleteClosedNoteInStoreAsync(noteId: number): Promise<NotesState> {
  if (isTauri()) {
    await invoke('delete_closed_note_cmd', { noteId })
    await hydrateNotesFromRust()
    return readNotesState()
  }
  return deleteClosedNoteInStore(noteId)
}

export function deleteClosedNoteInStore(noteId: number): NotesState {
  const state = readNotesState()
  const savedAtMap = { ...state.savedAtMap }
  delete savedAtMap[noteId]
  const next = {
    ...state,
    closedNotes: state.closedNotes.filter(item => item.id !== noteId),
    savedAtMap,
  }
  if (!isTauri()) {
    saveNotes(next.notes, next.savedAtMap, next.closedNotes)
  }
  cache = next
  return next
}

export function applyThemeToAllNotes(themeId: string): NotesState {
  if (isTauri()) {
    void invoke('apply_theme_cmd', { theme: themeId })
    const state = readNotesState()
    const next = {
      ...state,
      notes: state.notes.map(note => ({ ...note, theme: themeId })),
    }
    cache = next
    return next
  }
  const state = readNotesState()
  const next = {
    ...state,
    notes: state.notes.map(note => ({ ...note, theme: themeId })),
  }
  saveNotes(next.notes, next.savedAtMap, next.closedNotes)
  return next
}

export function cycleAllNoteThemes(themes: { id: string }[]): NotesState {
  const state = readNotesState()
  if (state.notes.length === 0) return state
  if (isTauri()) {
    void invoke('cycle_theme_cmd')
    const currentIdx = themes.findIndex(theme => theme.id === state.notes[0].theme)
    const nextTheme = themes[(currentIdx + 1 + themes.length) % themes.length].id
    const next = {
      ...state,
      notes: state.notes.map(note => ({ ...note, theme: nextTheme })),
    }
    cache = next
    return next
  }
  const currentIdx = themes.findIndex(theme => theme.id === state.notes[0].theme)
  const nextTheme = themes[(currentIdx + 1 + themes.length) % themes.length].id
  const next = {
    ...state,
    notes: state.notes.map(note => ({ ...note, theme: nextTheme })),
  }
  saveNotes(next.notes, next.savedAtMap, next.closedNotes)
  return next
}

export async function touchNoteSavedAtAsync(noteId: number): Promise<NotesState> {
  if (isTauri()) {
    await invoke('touch_saved_at_cmd', { noteId })
    const state = readNotesState()
    const next = {
      ...state,
      savedAtMap: { ...state.savedAtMap, [noteId]: Date.now() },
    }
    cache = next
    return next
  }
  return touchNoteSavedAt(noteId)
}

export function touchNoteSavedAt(noteId: number): NotesState {
  const state = readNotesState()
  const next = {
    ...state,
    savedAtMap: { ...state.savedAtMap, [noteId]: Date.now() },
  }
  if (!isTauri()) {
    saveNotes(next.notes, next.savedAtMap, next.closedNotes)
  }
  cache = next
  return next
}
