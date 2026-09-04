import { convertFileSrc, invoke } from '@tauri-apps/api/core'
import { isTauri } from '@/lib/tauri'

/** Legacy folder used before Typora-style `{name}.assets`. */
export const NOTE_IMAGE_PREFIX = 'images/'
/** Soft cap for clipboard paste; keeps IPC and disk use bounded. */
export const MAX_NOTE_IMAGE_BYTES = 8 * 1024 * 1024

const ASSETS_FOLDER_RE = /^[^/\\]+\.assets\/[^/\\]+$/

/** CommonMark: destinations with spaces/() must use <...> or they won't parse as images. */
export function formatMarkdownImageDest(path: string): string {
  const cleaned = path.replace(/^\.\//, '').trim()
  if (/[\s()[\]<>]/.test(cleaned)) {
    return `<${cleaned}>`
  }
  return cleaned
}

export function parseMarkdownImageDest(raw: string): string {
  let dest = raw.trim()
  if (dest.startsWith('<') && dest.endsWith('>') && dest.length >= 2) {
    dest = dest.slice(1, -1).trim()
  }
  dest = dest.replace(/^\.\//, '')
  try {
    dest = decodeURIComponent(dest)
  } catch {
    // keep as-is
  }
  return dest
}

export function isLocalNoteImagePath(path: string): boolean {
  if (!path || path.includes('..') || path.includes('\\')) return false
  if (path.startsWith(NOTE_IMAGE_PREFIX) && !path.slice(NOTE_IMAGE_PREFIX.length).includes('/')) {
    return path.length > NOTE_IMAGE_PREFIX.length
  }
  return ASSETS_FOLDER_RE.test(path)
}

export function normalizeNoteImageSrc(src: string | undefined): string | null {
  if (!src) return null
  let decoded = parseMarkdownImageDest(src)

  if (isLocalNoteImagePath(decoded)) return decoded

  const assetsIdx = decoded.search(/[^/]+\.assets\/[^/?#]+/)
  if (assetsIdx !== -1) {
    const candidate = decoded.slice(assetsIdx).split(/[?#]/)[0]
    if (isLocalNoteImagePath(candidate)) return candidate
  }

  const marker = `/${NOTE_IMAGE_PREFIX}`
  const idx = decoded.indexOf(marker)
  if (idx !== -1) {
    const candidate = decoded.slice(idx + 1).split(/[?#]/)[0]
    if (isLocalNoteImagePath(candidate)) return candidate
  }

  return null
}

export function isNoteImagePath(src: string | undefined): src is string {
  return normalizeNoteImageSrc(src) !== null
}

export function extractNoteImagePaths(content: string): string[] {
  const paths = new Set<string>()
  let rest = content
  while (true) {
    const idx = rest.indexOf('](')
    if (idx === -1) break
    const sub = rest.slice(idx + 2)
    const end = sub.indexOf(')')
    if (end === -1) break
    const candidate = parseMarkdownImageDest(sub.slice(0, end))
    if (isLocalNoteImagePath(candidate)) paths.add(candidate)
    rest = sub.slice(end)
  }
  return [...paths]
}

/** Map display URLs back to relative paths; drop any embedded data:/asset: image links. */
export function toCanonicalMarkdown(
  raw: string,
  srcMap: Record<string, string> = {},
): string {
  let next = raw
  for (const [path, url] of Object.entries(srcMap)) {
    if (!url) continue
    next = next.split(`](${url})`).join(`](${formatMarkdownImageDest(path)})`)
  }
  // Never persist base64 or asset-protocol URLs in the note body (Typora-style paths only).
  next = next.replace(/!\[[^\]]*]\(data:[^)]*\)/gi, '')
  next = next.replace(/!\[[^\]]*]\(asset:[^)]*\)/gi, '')
  next = next.replace(/!\[[^\]]*]\(https?:\/\/asset\.localhost[^)]*\)/gi, '')
  // Normalize bare destinations that need angle brackets.
  next = next.replace(/!\[([^\]]*)]\(([^)]+)\)/g, (_m, alt: string, dest: string) => {
    const path = parseMarkdownImageDest(dest)
    if (!isLocalNoteImagePath(path)) return `![${alt}](${dest})`
    return `![${alt}](${formatMarkdownImageDest(path)})`
  })
  return next
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export async function saveNoteImageFromClipboard(
  noteId: number,
  file: File,
  noteTitle = '',
): Promise<string | null> {
  if (!isTauri()) return null
  try {
    if (file.size > MAX_NOTE_IMAGE_BYTES) {
      console.error('[note-images] save failed: image too large')
      return null
    }
    const buffer = await file.arrayBuffer()
    const bytes = new Uint8Array(buffer)
    if (bytes.byteLength > MAX_NOTE_IMAGE_BYTES) {
      console.error('[note-images] save failed: image too large')
      return null
    }
    const ext = file.type.split('/')[1] || 'png'
    // IPC still uses base64 for transfer only; file is written to disk, not into markdown.
    return await invoke<string>('save_note_image_cmd', {
      noteId,
      dataBase64: bytesToBase64(bytes),
      extension: ext,
      noteTitle,
    })
  } catch (error) {
    console.error('[note-images] save failed:', error)
    return null
  }
}

/**
 * Resolve a local relative image path to a WebView-loadable URL (asset protocol).
 * Does not embed file bytes into markdown.
 */
export async function resolveNoteImageUrl(
  noteId: number,
  relativePath: string,
): Promise<string | null> {
  if (!isTauri()) return null
  const normalized = normalizeNoteImageSrc(relativePath) ?? relativePath
  if (!isLocalNoteImagePath(normalized)) return null

  try {
    const absPath = await invoke<string>('resolve_note_image_path_cmd', {
      noteId,
      relativePath: normalized,
    })
    if (absPath) {
      return convertFileSrc(absPath)
    }
  } catch (error) {
    console.error('[note-images] asset resolve failed:', error)
  }
  return null
}

export function buildImageMarkdown(relativePath: string, alt = 'image'): string {
  return `![${alt}](${formatMarkdownImageDest(relativePath)})`
}
