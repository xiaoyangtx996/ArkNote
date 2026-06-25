import { useEffect, useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'
import { normalizeNoteImageSrc, resolveNoteImageUrl } from '@/lib/note-images'

interface NoteMarkdownProps {
  noteId: number
  content: string
}

function extractImagePaths(content: string): string[] {
  const paths = new Set<string>()
  let rest = content
  while (true) {
    const idx = rest.indexOf('](images/')
    if (idx === -1) break
    const sub = rest.slice(idx + 2)
    const end = sub.indexOf(')')
    if (end === -1) break
    paths.add(sub.slice(0, end))
    rest = sub.slice(end)
  }
  return [...paths]
}

export function NoteMarkdown({ noteId, content }: NoteMarkdownProps) {
  const imagePaths = useMemo(() => extractImagePaths(content), [content])
  const [srcMap, setSrcMap] = useState<Record<string, string>>({})

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const entries = await Promise.all(
        imagePaths.map(async path => {
          const url = await resolveNoteImageUrl(noteId, path)
          return url ? ([path, url] as const) : null
        }),
      )
      if (cancelled) return
      const next: Record<string, string> = {}
      for (const entry of entries) {
        if (entry) next[entry[0]] = entry[1]
      }
      setSrcMap(next)
    })()
    return () => {
      cancelled = true
    }
  }, [noteId, imagePaths])

  const components: Components = useMemo(
    () => ({
      img: ({ src, alt, ...props }) => {
        const normalized = normalizeNoteImageSrc(src)
        if (normalized) {
          const resolved = srcMap[normalized]
          if (!resolved) {
            return (
              <span className="inline-block rounded border border-dashed px-2 py-1 text-xs text-muted-foreground">
                {alt || '图片加载中…'}
              </span>
            )
          }
          return (
            <img
              {...props}
              src={resolved}
              alt={alt ?? ''}
              className="my-2 max-w-full rounded-md"
              loading="lazy"
            />
          )
        }
        if (
          src &&
          (src.startsWith('http://') ||
            src.startsWith('https://') ||
            src.startsWith('data:'))
        ) {
          return (
            <img
              {...props}
              src={src}
              alt={alt ?? ''}
              className="my-2 max-w-full rounded-md"
              loading="lazy"
            />
          )
        }
        return (
          <span className="inline-block rounded border border-dashed px-2 py-1 text-xs text-muted-foreground">
            无法加载图片
          </span>
        )
      },
    }),
    [srcMap],
  )

  return (
    <div className="note-markdown select-text">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
}
