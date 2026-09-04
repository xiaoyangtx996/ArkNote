export interface Note {
  id: number
  title: string
  content: string
  position: { x: number; y: number }
  size: { width: number; height: number }
  isPinned: boolean
  theme: string
  isPreview?: boolean
}

export interface StoredNotes {
  version: 1
  notes: Note[]
  savedAtMap: Record<number, number>
  closedNotes?: Note[]
}

const STORAGE_KEY = 'arknote-notes'
const SCHEMA_VERSION = 1 as const

function isValidNote(value: unknown): value is Note {
  if (!value || typeof value !== 'object') return false
  const note = value as Record<string, unknown>
  if (typeof note.id !== 'number') return false
  if (note.title !== undefined && typeof note.title !== 'string') return false
  if (typeof note.content !== 'string') return false
  if (typeof note.isPinned !== 'boolean') return false
  if (typeof note.theme !== 'string') return false
  if (note.isPreview !== undefined && typeof note.isPreview !== 'boolean') return false

  const position = note.position
  if (!position || typeof position !== 'object') return false
  const { x, y } = position as Record<string, unknown>
  if (typeof x !== 'number' || typeof y !== 'number') return false

  const size = note.size
  if (!size || typeof size !== 'object') return false
  const { width, height } = size as Record<string, unknown>
  if (typeof width !== 'number' || typeof height !== 'number') return false

  return true
}

function isValidSavedAtMap(value: unknown): value is Record<number, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.entries(value).every(
    ([key, val]) => !Number.isNaN(Number(key)) && typeof val === 'number',
  )
}

function isValidStoredNotes(value: unknown): value is StoredNotes {
  if (!value || typeof value !== 'object') return false
  const data = value as Record<string, unknown>
  if (data.version !== SCHEMA_VERSION) return false
  if (!Array.isArray(data.notes) || !data.notes.every(isValidNote)) return false
  if (!isValidSavedAtMap(data.savedAtMap)) return false
  if (data.closedNotes !== undefined) {
    if (!Array.isArray(data.closedNotes) || !data.closedNotes.every(isValidNote)) return false
  }
  return true
}

function defaultNoteTitle(id: number): string {
  return `便签 #${id}`
}

import { toCanonicalMarkdown } from '@/lib/note-images'

export function normalizeNote(note: Note): Note {
  return {
    ...note,
    title: note.title?.trim() || defaultNoteTitle(note.id),
    // Drop any historically embedded data:/asset: image URLs from the body.
    content: toCanonicalMarkdown(note.content ?? ''),
  }
}

/** Shared close/discard rule: only non-whitespace content is kept in recycle. */
export function hasNoteContent(note: Pick<Note, 'content'>): boolean {
  return note.content.trim().length > 0
}

export function getDefaultNoteScreenPosition(id: number): { x: number; y: number } {
  const offset = (id % 8) * 28
  const width = typeof window !== 'undefined' ? (window.screen?.availWidth ?? 1920) : 1920
  const height = typeof window !== 'undefined' ? (window.screen?.availHeight ?? 1080) : 1080
  return {
    x: Math.max(40, width / 2 - 150 + offset),
    y: Math.max(40, height / 2 - 100 + offset),
  }
}

/** Factory for both desktop hydrate defaults and browser-preview notes. */
export function createDefaultNote(id: number): Note {
  return {
    id,
    title: defaultNoteTitle(id),
    content: '',
    position: getDefaultNoteScreenPosition(id),
    size: { width: 300, height: 400 },
    isPinned: false,
    theme: 'business',
    isPreview: false,
  }
}

function migrateLegacyNotes(value: unknown): Pick<StoredNotes, 'notes' | 'savedAtMap'> | null {
  if (!Array.isArray(value) || !value.every(isValidNote)) return null
  return { notes: value.map(note => normalizeNote(note as Note)), savedAtMap: {} }
}

export function loadNotes(): Pick<StoredNotes, 'notes' | 'savedAtMap' | 'closedNotes'> | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (isValidStoredNotes(parsed)) {
      return {
        notes: parsed.notes.map(normalizeNote),
        savedAtMap: parsed.savedAtMap,
        closedNotes: (parsed.closedNotes ?? []).map(normalizeNote),
      }
    }
    const legacy = migrateLegacyNotes(parsed)
    return legacy ? { ...legacy, closedNotes: [] } : null
  } catch {
    return null
  }
}

export function saveNotes(
  notes: Note[],
  savedAtMap: Record<number, number>,
  closedNotes: Note[] = [],
): void {
  try {
    const payload: StoredNotes = {
      version: SCHEMA_VERSION,
      notes,
      savedAtMap,
      closedNotes,
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
  } catch {
    // ignore quota / privacy errors
  }
}
