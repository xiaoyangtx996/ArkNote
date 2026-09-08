import { useState, useEffect, useRef } from 'react'
import { Rnd } from 'react-rnd'
import { getCurrentWindow } from '@tauri-apps/api/window'
import { Card, CardHeader } from './ui/card'
import { Button } from './ui/button'
import { X, Pin, PinOff, PlusCircle } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'
import { cn } from '../lib/utils'
import { formatSavedTime } from '@/lib/format-time'
import type { Note } from '@/lib/note-storage'
import { NoteListMenu } from './note-list-menu'
import { NoteLiveEditor } from './note-live-editor'

interface NoteWindowProps {
  note: Note
  zIndex: number
  savedAt?: number
  closedNotes: Note[]
  variant?: 'embedded' | 'standalone'
  /** Pinned edge-dock bookmark state (desktop only). */
  edgeDocked?: boolean
  edgeDockSide?: 'left' | 'right' | 'top' | 'bottom' | null
  onUpdate: (updates: Partial<Note>) => void
  onClose: () => void
  onNewNote?: () => void
  onSaveNow?: () => void
  onActivate?: () => void
  onRestoreNote: (noteId: number) => void
  onDeleteClosedNote: (noteId: number) => void
}

function BookmarkTab({
  title,
  edge,
}: {
  title: string
  edge: 'left' | 'right' | 'top' | 'bottom'
}) {
  return (
    <div
      className={cn(
        'flex h-full w-full flex-row items-center gap-1.5 overflow-hidden border border-black/[0.08] bg-white/95 px-2 select-none dark:border-white/10 dark:bg-neutral-900/90',
        edge === 'left' && 'rounded-none rounded-r-md border-l-0',
        edge === 'right' && 'rounded-none rounded-l-md border-r-0',
        edge === 'top' && 'rounded-none rounded-b-md border-t-0',
        edge === 'bottom' && 'rounded-none rounded-t-md border-b-0',
      )}
      title={title}
    >
      <img
        src={`${import.meta.env.BASE_URL}mark.png`}
        alt=""
        draggable={false}
        className="h-5 w-5 shrink-0 object-contain opacity-90"
      />
      <span className="min-w-0 flex-1 truncate text-[11px] font-medium tracking-tight text-neutral-700 dark:text-neutral-200">
        {title}
      </span>
    </div>
  )
}

export function NoteWindow({
  note,
  zIndex,
  savedAt,
  closedNotes,
  variant = 'embedded',
  edgeDocked = false,
  edgeDockSide = null,
  onUpdate,
  onClose,
  onNewNote,
  onSaveNow,
  onActivate,
  onRestoreNote,
  onDeleteClosedNote,
}: NoteWindowProps) {
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState(note.title)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const charCount = note.content.replace(/\s/g, '').length

  useEffect(() => {
    if (!isEditingTitle) {
      setDraftTitle(note.title)
    }
  }, [note.title, isEditingTitle])

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    }
  }, [isEditingTitle])

  const commitTitle = () => {
    const next = draftTitle.trim() || `便签 #${note.id}`
    onUpdate({ title: next })
    setDraftTitle(next)
    setIsEditingTitle(false)
  }

  const cancelTitleEdit = () => {
    setDraftTitle(note.title)
    setIsEditingTitle(false)
  }

  const togglePin = () => {
    onUpdate({ isPinned: !note.isPinned })
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isEditingTitle) return
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault()
      onSaveNow?.()
    }
  }

  const getThemeStyles = () => {
    switch (note.theme) {
      case 'business':
        return 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
      case 'eyecare':
        return 'bg-green-50 dark:bg-green-900/30 text-green-900 dark:text-green-100'
      case 'dark':
        return 'bg-gray-900 text-gray-100'
      default:
        return 'bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100'
    }
  }

  const startWindowDrag = (e: React.MouseEvent) => {
    if (variant !== 'standalone' || e.button !== 0) return
    e.preventDefault()
    void getCurrentWindow().startDragging()
  }

  const startWindowResize = (
    e: React.MouseEvent,
    direction:
      | 'East'
      | 'North'
      | 'NorthEast'
      | 'NorthWest'
      | 'South'
      | 'SouthEast'
      | 'SouthWest'
      | 'West',
  ) => {
    if (variant !== 'standalone' || e.button !== 0) return
    e.preventDefault()
    e.stopPropagation()
    void getCurrentWindow().startResizeDragging(direction)
  }

  const resizeHandles =
    variant === 'standalone' ? (
      <>
        <div
          className="pointer-events-auto absolute bottom-0 right-0 z-[60] h-5 w-5 cursor-se-resize"
          onMouseDown={e => startWindowResize(e, 'SouthEast')}
          title="拖动缩放"
          aria-label="拖动右下角缩放窗口"
        />
        <div
          className="pointer-events-auto absolute bottom-0 left-5 right-5 z-[55] h-2 cursor-s-resize"
          onMouseDown={e => startWindowResize(e, 'South')}
          aria-hidden
        />
        <div
          className="pointer-events-auto absolute top-8 bottom-5 right-0 z-[55] w-2 cursor-e-resize"
          onMouseDown={e => startWindowResize(e, 'East')}
          aria-hidden
        />
      </>
    ) : null

  const headerActions =
    variant === 'standalone' ? (
      <div className="relative z-20 flex items-center gap-0.5 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="新建便签"
          onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation()
            onNewNote?.()
          }}
        >
          <PlusCircle size={14} />
        </Button>
        <NoteListMenu
          closedNotes={closedNotes}
          onRestore={onRestoreNote}
          onDelete={onDeleteClosedNote}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          title="关闭便签"
          onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation()
            onClose()
          }}
        >
          <X size={14} />
        </Button>
      </div>
    ) : (
      <div className="relative z-10 flex items-center gap-1 shrink-0">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onMouseDown={e => e.stopPropagation()}
              onClick={() => onNewNote?.()}
            >
              <PlusCircle size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">新建便签</TooltipContent>
        </Tooltip>
        <NoteListMenu
          closedNotes={closedNotes}
          onRestore={onRestoreNote}
          onDelete={onDeleteClosedNote}
        />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              onMouseDown={e => e.stopPropagation()}
              onClick={onClose}
            >
              <X size={14} />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">关闭</TooltipContent>
        </Tooltip>
      </div>
    )

  const card = (
    <Card
      data-note-window
      onMouseDown={() => onActivate?.()}
      onKeyDown={handleKeyDown}
      className={cn(
        // Header menus need overflow-visible; clip only the editor pane below.
        'relative flex h-full min-h-0 flex-col overflow-visible rounded-lg border shadow-none drop-shadow-xl',
        getThemeStyles(),
        'border-gray-200 dark:border-gray-700',
      )}
    >
      {resizeHandles}
      <CardHeader className="relative z-30 shrink-0 flex flex-row items-center justify-between space-y-0 overflow-visible border-b gap-1 p-2">
        <TooltipProvider delayDuration={800} skipDelayDuration={0}>
          <div className="flex flex-1 items-center gap-1 min-w-0 w-full overflow-visible">
            <div className="flex items-center gap-1 text-xs font-medium min-w-0 max-w-[38%] shrink">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation()
                      togglePin()
                    }}
                    onMouseDown={e => e.stopPropagation()}
                    className="shrink-0 rounded p-0.5 hover:bg-accent transition-colors"
                    aria-label={note.isPinned ? '取消置顶' : '置顶便签'}
                  >
                    {note.isPinned ? <PinOff size={14} /> : <Pin size={14} />}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  {note.isPinned ? '取消置顶' : '置顶便签'}
                </TooltipContent>
              </Tooltip>
              {isEditingTitle ? (
                <input
                  ref={titleInputRef}
                  type="text"
                  value={draftTitle}
                  onChange={e => setDraftTitle(e.target.value)}
                  onBlur={commitTitle}
                  onKeyDown={e => {
                    e.stopPropagation()
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      commitTitle()
                    } else if (e.key === 'Escape') {
                      e.preventDefault()
                      cancelTitleEdit()
                    }
                  }}
                  onMouseDown={e => e.stopPropagation()}
                  onDoubleClick={e => e.stopPropagation()}
                  className="note-title-input h-5 w-full min-w-0 rounded-sm border border-input bg-background px-1 text-xs font-medium outline-none focus-visible:ring-1 focus-visible:ring-ring"
                />
              ) : (
                <span
                  className="truncate cursor-text select-none"
                  title={`${note.title}（双击编辑）`}
                  onMouseDown={variant === 'standalone' ? startWindowDrag : undefined}
                  onDoubleClick={e => {
                    e.stopPropagation()
                    setDraftTitle(note.title)
                    setIsEditingTitle(true)
                  }}
                >
                  {note.title}
                </span>
              )}
            </div>
            <div
              className="note-drag-handle flex-1 h-6 min-w-[12px] cursor-move"
              onMouseDown={startWindowDrag}
              aria-hidden
            />
            {headerActions}
          </div>
        </TooltipProvider>
      </CardHeader>

      <div className="relative min-h-0 flex-1 overflow-hidden pt-1 pl-1 pb-1 pr-0">
        <NoteLiveEditor
          noteId={note.id}
          noteTitle={note.title}
          content={note.content}
          themeId={note.theme}
          onChange={next => onUpdate({ content: next })}
        />
      </div>

      <div className="shrink-0 border-t p-2 text-xs text-gray-500 dark:text-gray-400 flex justify-between items-center">
        <div>{charCount} 字</div>
        <div>{savedAt ? `上次保存: ${formatSavedTime(savedAt)}` : '尚未保存'}</div>
      </div>
    </Card>
  )

  if (variant === 'standalone') {
    if (edgeDocked && edgeDockSide) {
      return (
        <div
          className="relative h-full w-full overflow-hidden"
          style={{ zIndex }}
          onMouseDown={() => onActivate?.()}
        >
          <BookmarkTab title={note.title} edge={edgeDockSide} />
        </div>
      )
    }

    return (
      <div className="relative h-full w-full overflow-visible rounded-lg" style={{ zIndex }}>
        <div className="relative h-full overflow-visible">{card}</div>
      </div>
    )
  }

  return (
    <Rnd
      position={note.position}
      size={note.size}
      minWidth={250}
      minHeight={310}
      bounds="parent"
      dragHandleClassName="note-drag-handle"
      cancel="textarea, button, input, .vditor, .note-live-editor, .note-title-input, [data-radix-popper-content-wrapper]"
      onDragStart={() => onActivate?.()}
      onDragStop={(_e, d) => {
        onUpdate({ position: { x: d.x, y: d.y } })
      }}
      onResizeStop={(_e, _direction, ref, _delta, position) => {
        onUpdate({
          size: {
            width: Number.parseInt(ref.style.width, 10),
            height: Number.parseInt(ref.style.height, 10),
          },
          position,
        })
      }}
      className="absolute rounded-lg overflow-hidden"
      style={{ zIndex, background: 'transparent' }}
    >
      {card}
    </Rnd>
  )
}
