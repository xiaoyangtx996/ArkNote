import { useEffect, useRef, useState } from 'react'
import { LayoutList, X } from 'lucide-react'
import { Button } from './ui/button'
import { cn } from '@/lib/utils'
import type { Note } from '@/lib/note-storage'

interface NoteListMenuProps {
  closedNotes: Note[]
  onRestore: (noteId: number) => void
  onDelete: (noteId: number) => void
}

/**
 * In-window popover (no Radix Portal). Portal menus on transparent Tauri
 * windows often leave a stuck overlay and appear to "freeze" the note.
 * At min size (250×310) the panel must stay inside the card: clamp width/height
 * and scroll instead of overflowing/clipping awkwardly.
 */
export function NoteListMenu({ closedNotes, onRestore, onDelete }: NoteListMenuProps) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative shrink-0">
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7"
        title="便签列表"
        aria-expanded={open}
        aria-haspopup="menu"
        onPointerDown={e => e.stopPropagation()}
        onClick={e => {
          e.stopPropagation()
          setOpen(value => !value)
        }}
      >
        <LayoutList size={14} />
      </Button>
      {open ? (
        <div
          role="menu"
          className={cn(
            'absolute right-0 top-full z-[100000] mt-1',
            'w-[min(13.5rem,calc(100vw-1.25rem))]',
            'max-h-[min(11rem,calc(100vh-5.5rem))] overflow-y-auto overflow-x-hidden',
            'rounded-md border bg-popover p-1 text-popover-foreground shadow-md',
          )}
          onPointerDown={e => e.stopPropagation()}
        >
          {closedNotes.length === 0 ? (
            <div className="px-2 py-2 text-xs text-muted-foreground">暂无已关闭便签</div>
          ) : (
            closedNotes.map(note => (
              <div
                key={note.id}
                className="flex min-w-0 items-center gap-0.5 rounded-sm hover:bg-accent"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm outline-none"
                  title={note.title}
                  onClick={() => {
                    setOpen(false)
                    // Defer so the popover unmounts before opening another window.
                    window.setTimeout(() => onRestore(note.id), 0)
                  }}
                >
                  {note.title}
                </button>
                <button
                  type="button"
                  className={cn(
                    'shrink-0 rounded-sm p-1 text-muted-foreground outline-none transition-colors',
                    'hover:bg-background hover:text-foreground',
                  )}
                  aria-label={`从列表移除 ${note.title}`}
                  onClick={e => {
                    e.stopPropagation()
                    onDelete(note.id)
                  }}
                >
                  <X size={12} />
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}
    </div>
  )
}
