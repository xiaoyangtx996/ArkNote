import { useEffect, useRef, useState } from 'react'
import Vditor from 'vditor'
import 'vditor/dist/index.css'
import {
  buildImageMarkdown,
  extractNoteImagePaths,
  isLocalNoteImagePath,
  normalizeNoteImageSrc,
  resolveNoteImageUrl,
  saveNoteImageFromClipboard,
  toCanonicalMarkdown,
} from '@/lib/note-images'
import { cn } from '@/lib/utils'

const SELECTION_COPY_SETTLE_MS = 80
const COPY_HINT_MS = 1200

interface NoteLiveEditorProps {
  noteId: number
  noteTitle: string
  content: string
  themeId: string
  className?: string
  onChange: (content: string) => void
}

function vditorCdn(): string {
  const base = import.meta.env.BASE_URL || './'
  return `${base}vditor`.replace(/\/{2,}/g, '/').replace(':/', '://')
}

function noteThemeToVditor(themeId: string): {
  theme: 'dark' | 'classic'
  contentTheme: string
} {
  if (themeId === 'dark') {
    return { theme: 'dark', contentTheme: 'dark' }
  }
  return { theme: 'classic', contentTheme: 'light' }
}

async function buildSrcMap(noteId: number, content: string) {
  const paths = extractNoteImagePaths(content)
  const srcMap: Record<string, string> = {}
  await Promise.all(
    paths.map(async path => {
      const url = await resolveNoteImageUrl(noteId, path)
      if (url) srcMap[path] = url
    }),
  )
  return srcMap
}

/** Rewrite <img src> in the editor DOM to asset URLs; markdown source stays relative. */
async function rewriteEditorImageDom(
  root: HTMLElement,
  noteId: number,
  srcMap: Record<string, string>,
) {
  const images = root.querySelectorAll('img')
  await Promise.all(
    Array.from(images).map(async img => {
      const raw = img.getAttribute('src') ?? ''
      if (raw.startsWith('asset:') || raw.startsWith('https://asset.localhost')) return
      if (raw.startsWith('data:')) {
        // Should not remain; leave until canonical save strips it from markdown.
        return
      }
      const normalized = normalizeNoteImageSrc(raw) ?? (isLocalNoteImagePath(raw) ? raw : null)
      if (!normalized) return
      let url = srcMap[normalized]
      if (!url) {
        url = (await resolveNoteImageUrl(noteId, normalized)) ?? ''
        if (url) srcMap[normalized] = url
      }
      if (url && img.getAttribute('src') !== url) {
        img.setAttribute('src', url)
      }
    }),
  )
}

function selectionTextInside(root: HTMLElement): string {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return ''
  const range = sel.getRangeAt(0)
  if (!root.contains(range.commonAncestorContainer)) return ''
  return sel.toString()
}

function selectionEndPoint(root: HTMLElement): { left: number; top: number } | null {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) return null
  const range = sel.getRangeAt(0)
  if (!root.contains(range.commonAncestorContainer)) return null
  const end = range.cloneRange()
  end.collapse(false)
  let rect = end.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) {
    const full = range.getBoundingClientRect()
    rect = full
  }
  const rootRect = root.getBoundingClientRect()
  return {
    left: Math.max(0, rect.right - rootRect.left + 4),
    top: Math.max(0, rect.top - rootRect.top - 2),
  }
}

/**
 * Typora-like IR: markdown stores relative `{name}.assets/...` paths only.
 * Preview uses asset-protocol file URLs in the DOM, never base64 in the document.
 */
export function NoteLiveEditor({
  noteId,
  noteTitle,
  content,
  themeId,
  className,
  onChange,
}: NoteLiveEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const rootRef = useRef<HTMLDivElement>(null)
  const vditorRef = useRef<Vditor | null>(null)
  const srcMapRef = useRef<Record<string, string>>({})
  const contentRef = useRef(content)
  const onChangeRef = useRef(onChange)
  const applyingRef = useRef(false)
  const noteIdRef = useRef(noteId)
  const noteTitleRef = useRef(noteTitle)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const hintTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const lastCopiedRef = useRef('')
  const selectingRef = useRef(false)
  const [copyHint, setCopyHint] = useState<{ left: number; top: number } | null>(null)

  contentRef.current = content
  onChangeRef.current = onChange
  noteIdRef.current = noteId
  noteTitleRef.current = noteTitle

  // Drag-select → mouseup → copy; show 「已复制」at selection end.
  useEffect(() => {
    const root = rootRef.current
    if (!root) return

    const showHintAtSelection = () => {
      const point = selectionEndPoint(root)
      if (!point) return
      setCopyHint(point)
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
      hintTimerRef.current = setTimeout(() => setCopyHint(null), COPY_HINT_MS)
    }

    const copySelection = () => {
      const text = selectionTextInside(root).trim()
      if (!text || text === lastCopiedRef.current) return
      void navigator.clipboard
        .writeText(text)
        .then(() => {
          lastCopiedRef.current = text
          showHintAtSelection()
        })
        .catch(() => {
          // clipboard unavailable
        })
    }

    const scheduleCopy = () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(copySelection, SELECTION_COPY_SETTLE_MS)
    }

    const onPointerDown = () => {
      selectingRef.current = true
      lastCopiedRef.current = ''
      setCopyHint(null)
    }

    const onPointerUp = () => {
      if (!selectingRef.current) return
      selectingRef.current = false
      scheduleCopy()
    }

    const onSelectionChange = () => {
      if (!selectionTextInside(root)) {
        if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
        lastCopiedRef.current = ''
      }
    }

    root.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('pointerup', onPointerUp)
    document.addEventListener('selectionchange', onSelectionChange)
    return () => {
      root.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('pointerup', onPointerUp)
      document.removeEventListener('selectionchange', onSelectionChange)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      if (hintTimerRef.current) clearTimeout(hintTimerRef.current)
    }
  }, [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    let cancelled = false
    let instance: Vditor | null = null
    let rewriteTimer: ReturnType<typeof setTimeout> | undefined

    const scheduleRewrite = () => {
      if (rewriteTimer) clearTimeout(rewriteTimer)
      rewriteTimer = setTimeout(() => {
        const root = hostRef.current
        if (!root || cancelled) return
        void rewriteEditorImageDom(root, noteIdRef.current, srcMapRef.current)
      }, 50)
    }

    const emitCanonical = (markdown: string) => {
      const canonical = toCanonicalMarkdown(markdown, srcMapRef.current)
      if (canonical === contentRef.current) return
      onChangeRef.current(canonical)
    }

    void (async () => {
      const canonicalSeed = toCanonicalMarkdown(contentRef.current, {})
      srcMapRef.current = await buildSrcMap(noteId, canonicalSeed)
      if (cancelled || !hostRef.current) return

      const { theme, contentTheme } = noteThemeToVditor(themeId)

      instance = new Vditor(hostRef.current, {
        // Always load relative paths into the editor source (Typora-style).
        value: canonicalSeed,
        mode: 'ir',
        height: '100%',
        cdn: vditorCdn(),
        cache: { enable: false },
        toolbar: [],
        toolbarConfig: { hide: true, pin: false },
        preview: {
          hljs: { lineNumber: false, enable: false },
        },
        theme,
        icon: 'emoji',
        placeholder: '开始输入 Markdown…可直接粘贴图片',
        input(value) {
          if (applyingRef.current) return
          emitCanonical(value)
          scheduleRewrite()
        },
        after() {
          if (cancelled) {
            instance?.destroy()
            return
          }
          vditorRef.current = instance
          instance?.setTheme(theme, contentTheme)
          scheduleRewrite()
        },
        upload: {
          accept: 'image/*',
          multiple: false,
          handler: async files => {
            const file = files?.[0]
            if (!file) return '未选择图片'
            try {
              const relativePath = await saveNoteImageFromClipboard(
                noteIdRef.current,
                file,
                noteTitleRef.current,
              )
              if (!relativePath) return '图片保存失败'

              const fileUrl = await resolveNoteImageUrl(noteIdRef.current, relativePath)
              if (fileUrl) {
                srcMapRef.current = {
                  ...srcMapRef.current,
                  [relativePath]: fileUrl,
                }
              }

              // Insert relative path only — never data:/base64 into the document.
              applyingRef.current = true
              try {
                instance?.insertValue(buildImageMarkdown(relativePath))
              } finally {
                applyingRef.current = false
              }
              emitCanonical(instance?.getValue() ?? buildImageMarkdown(relativePath))
              scheduleRewrite()
              return ''
            } catch (error) {
              console.error('[note-live] image upload failed:', error)
              return '图片保存失败'
            }
          },
        },
      })
    })()

    return () => {
      cancelled = true
      if (rewriteTimer) clearTimeout(rewriteTimer)
      vditorRef.current = null
      instance?.destroy()
      if (host) host.innerHTML = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteId])

  useEffect(() => {
    const editor = vditorRef.current
    if (!editor) return
    const { theme, contentTheme } = noteThemeToVditor(themeId)
    editor.setTheme(theme, contentTheme)
  }, [themeId])

  useEffect(() => {
    const editor = vditorRef.current
    if (!editor) return

    const canonicalIncoming = toCanonicalMarkdown(content, srcMapRef.current)
    const currentCanonical = toCanonicalMarkdown(editor.getValue(), srcMapRef.current)
    if (currentCanonical === canonicalIncoming) {
      const root = hostRef.current
      if (root) void rewriteEditorImageDom(root, noteId, srcMapRef.current)
      return
    }

    let cancelled = false
    void (async () => {
      srcMapRef.current = {
        ...srcMapRef.current,
        ...(await buildSrcMap(noteId, canonicalIncoming)),
      }
      if (cancelled || !vditorRef.current) return
      applyingRef.current = true
      try {
        vditorRef.current.setValue(canonicalIncoming)
      } finally {
        applyingRef.current = false
      }
      const root = hostRef.current
      if (root) void rewriteEditorImageDom(root, noteId, srcMapRef.current)
    })()

    return () => {
      cancelled = true
    }
  }, [content, noteId])

  return (
    <div
      ref={rootRef}
      className={cn('note-live-editor relative h-full min-h-0 w-full overflow-hidden', className)}
      onMouseDown={e => e.stopPropagation()}
      onPointerDown={e => e.stopPropagation()}
    >
      <div ref={hostRef} className="h-full w-full" />
      {copyHint ? (
        <span
          className="pointer-events-none absolute z-50 -translate-y-1/2 rounded border border-black/[0.06] bg-neutral-100/95 px-1.5 py-0.5 text-[10px] font-medium text-neutral-500 shadow-sm backdrop-blur-sm"
          style={{ left: copyHint.left, top: copyHint.top + 8 }}
          role="status"
        >
          已复制
        </span>
      ) : null}
    </div>
  )
}
