import { invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/lib/tauri'

export const NOTE_IMAGE_PREFIX = 'images/'

export function normalizeNoteImageSrc(src: string | undefined): string | null {
  if (!src) return null
  let decoded = src
  try {
    decoded = decodeURIComponent(src)
  } catch {
    // keep original
  }
  if (decoded.startsWith(NOTE_IMAGE_PREFIX)) return decoded
  if (decoded.startsWith(`./${NOTE_IMAGE_PREFIX}`)) return decoded.slice(2)
  return null
}

export function isNoteImagePath(src: string | undefined): src is string {
  return normalizeNoteImageSrc(src) !== null
}

export async function saveNoteImageFromClipboard(
  noteId: number,
  file: File,
): Promise<string | null> {
  if (!isTauri()) return null
  try {
    const buffer = await file.arrayBuffer()
    const ext = file.type.split('/')[1] || 'png'
    return await invoke<string>('save_note_image_cmd', {
      noteId,
      data: Array.from(new Uint8Array(buffer)),
      extension: ext,
    })
  } catch (error) {
    console.error('[note-images] save failed:', error)
    return null
  }
}

export async function resolveNoteImageUrl(
  noteId: number,
  relativePath: string,
): Promise<string | null> {
  if (!isTauri()) return null
  const normalized = normalizeNoteImageSrc(relativePath) ?? relativePath
  if (!normalized.startsWith(NOTE_IMAGE_PREFIX)) return null
  try {
    return await invoke<string>('read_note_image_data_url_cmd', {
      noteId,
      relativePath: normalized,
    })
  } catch (error) {
    console.error('[note-images] resolve failed:', error)
    return null
  }
}

export function buildImageMarkdown(relativePath: string, alt = 'image'): string {
  return `![${alt}](${relativePath})`
}
