import { invoke, isTauri as tauriIsTauri } from '@tauri-apps/api/core'
import type { Note } from '@/lib/note-storage'

export const isTauri = () => {
  try {
    return tauriIsTauri()
  } catch {
    return '__TAURI_INTERNALS__' in window
  }
}

export interface NoteWindowSpec {
  id: number
  title: string
  x: number
  y: number
  width: number
  height: number
  is_pinned: boolean
}

export function noteToWindowSpec(note: Note): NoteWindowSpec {
  return {
    id: note.id,
    title: note.title,
    x: note.position.x,
    y: note.position.y,
    width: note.size.width,
    height: note.size.height,
    is_pinned: note.isPinned,
  }
}

async function invokeSafe<T>(command: string, args?: Record<string, unknown>): Promise<T | null> {
  try {
    return await invoke<T>(command, args)
  } catch (error) {
    console.error(`[tauri] ${command} failed:`, error)
    return null
  }
}

export async function openNoteWindow(note: Note) {
  if (!isTauri()) return
  await invokeSafe('open_note_window', { note: noteToWindowSpec(note) })
}

export async function closeNoteWindow(noteId: number) {
  if (!isTauri()) return
  await invokeSafe('close_note_window', { noteId })
}

export async function updateNoteWindow(note: Note) {
  if (!isTauri()) return
  await invokeSafe('update_note_window', { note: noteToWindowSpec(note) })
}

export async function setNoteAlwaysOnTop(noteId: number, isPinned: boolean) {
  if (!isTauri()) return
  await invokeSafe('set_note_always_on_top', { noteId, isPinned })
}

export async function createNewNote() {
  if (!isTauri()) return
  await invoke('create_note_cmd')
}

export type LastNoteCloseAction = 'keep-tray' | 'quit-app' | 'confirm-quit'

export interface AppSettings {
  version: number
  lastNoteClose: LastNoteCloseAction
}

export async function getAppSettings(): Promise<AppSettings | null> {
  if (!isTauri()) return null
  return invokeSafe<AppSettings>('get_settings_cmd')
}

export async function setLastNoteClose(action: LastNoteCloseAction) {
  if (!isTauri()) return
  await invokeSafe('set_last_note_close_cmd', { action })
}

export async function quitApp() {
  if (!isTauri()) return
  await invokeSafe('quit_app')
}
