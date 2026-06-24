import { useState, useEffect, useRef } from 'react'
import { Rnd } from 'react-rnd'
import { Card, CardContent, CardHeader } from './ui/card'
import { Button } from './ui/button'
import { Textarea } from './ui/textarea'
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/tabs'
import { X, Pin, PinOff, PlusCircle, Copy, Check } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip'
import { cn } from '../lib/utils'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { formatSavedTime } from '@/lib/format-time'
import type { Note } from '@/lib/note-storage'
import { NoteListMenu } from './note-list-menu'

interface NoteWindowProps {
  note: Note
  zIndex: number
  savedAt?: number
  closedNotes: Note[]
  onUpdate: (updates: Partial<Note>) => void
  onClose: () => void
  onNewNote?: () => void
  onSaveNow?: () => void
  onActivate?: () => void
  onRestoreNote: (noteId: number) => void
  onDeleteClosedNote: (noteId: number) => void
}

export function NoteWindow({
  note,
  zIndex,
  savedAt,
  closedNotes,
  onUpdate,
  onClose,
  onNewNote,
  onSaveNow,
  onActivate,
  onRestoreNote,
  onDeleteClosedNote,
}: NoteWindowProps) {
  const [activeTab, setActiveTab] = useState<string>(note.isPreview ? 'preview' : 'edit')
  const [isEditingTitle, setIsEditingTitle] = useState(false)
  const [draftTitle, setDraftTitle] = useState(note.title)
  const [copied, setCopied] = useState(false)
  const titleInputRef = useRef<HTMLInputElement>(null)
  const copyTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const charCount = note.content.replace(/\s/g, '').length

  useEffect(() => {
    setActiveTab(note.isPreview ? 'preview' : 'edit')
  }, [note.isPreview])

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

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdate({ content: e.target.value })
  }

  const togglePin = () => {
    onUpdate({ isPinned: !note.isPinned })
  }

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(note.content)
      setCopied(true)
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
      copyTimerRef.current = setTimeout(() => setCopied(false), 1500)
    } catch {
      // clipboard unavailable
    }
  }

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current)
    }
  }, [])

  const handleTabChange = (value: string) => {
    setActiveTab(value)
    onUpdate({ isPreview: value === 'preview' })
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

  return (
    <Rnd
      position={note.position}
      size={note.size}
      minWidth={250}
      minHeight={200}
      bounds="parent"
      dragHandleClassName="note-drag-handle"
      cancel="textarea, button, input, [role='tab'], [role='tablist'], [data-radix-popper-content-wrapper], .note-title-input"
      onDragStart={() => onActivate?.()}
      onDragStop={(e, d) => {
        onUpdate({ position: { x: d.x, y: d.y } })
      }}
      onResizeStop={(e, direction, ref, delta, position) => {
        onUpdate({
          size: { width: Number.parseInt(ref.style.width), height: Number.parseInt(ref.style.height) },
          position,
        })
      }}
      className="absolute rounded-lg overflow-hidden"
      style={{ zIndex, background: 'transparent' }}
    >
      <Card
        data-note-window
        onMouseDown={() => onActivate?.()}
        onKeyDown={handleKeyDown}
        className={cn(
          'h-full flex flex-col border-2 shadow-none drop-shadow-xl',
          getThemeStyles(),
          'border-gray-200 dark:border-gray-700',
        )}
      >
        <CardHeader className="p-2 flex flex-row items-center justify-between space-y-0 border-b gap-1">
          <TooltipProvider delayDuration={800} skipDelayDuration={0}>
            <div className="flex flex-1 items-center gap-1 min-w-0 w-full">
              <div className="flex items-center gap-1 text-xs font-medium min-w-0 max-w-[45%] shrink-0">
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
                    {note.isPinned ? (
                      <PinOff size={14} />
                    ) : (
                      <Pin size={14} />
                    )}
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
            <div className="note-drag-handle flex-1 h-6 min-w-[12px] cursor-move" aria-hidden />
            <div className="flex items-center gap-1 shrink-0">
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => onNewNote?.()}
                  >
                    <PlusCircle size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">新建便签</TooltipContent>
              </Tooltip>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => void handleCopy()}
                  >
                    {copied ? <Check size={14} className="text-green-600" /> : <Copy size={14} />}
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">{copied ? '已复制' : '复制内容'}</TooltipContent>
              </Tooltip>
              <NoteListMenu
                closedNotes={closedNotes}
                onRestore={onRestoreNote}
                onDelete={onDeleteClosedNote}
              />
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
                    <X size={14} />
                  </Button>
                </TooltipTrigger>
                <TooltipContent side="bottom">关闭便签</TooltipContent>
              </Tooltip>
            </div>
            </div>
          </TooltipProvider>
        </CardHeader>

        <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 flex flex-col">
          <TabsList className="grid grid-cols-2 mx-2 mt-2">
            <TabsTrigger value="edit">编辑</TabsTrigger>
            <TabsTrigger value="preview">预览</TabsTrigger>
          </TabsList>

          <TabsContent value="edit" className="flex-1 p-0 m-0">
            <CardContent className="p-2 flex-1 h-full">
              <Textarea
                value={note.content}
                onChange={handleContentChange}
                className="h-full min-h-[150px] resize-none border-0 focus-visible:ring-0 focus-visible:ring-offset-0 bg-transparent"
                placeholder="开始输入..."
              />
            </CardContent>
          </TabsContent>

          <TabsContent value="preview" className="flex-1 p-0 m-0">
            <CardContent className="p-4 prose prose-sm dark:prose-invert max-w-none h-full overflow-auto">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{note.content}</ReactMarkdown>
            </CardContent>
          </TabsContent>
        </Tabs>

        <div className="p-2 text-xs text-gray-500 dark:text-gray-400 border-t flex justify-between items-center">
          <div>{charCount} 字</div>
          <div>{savedAt ? `上次保存: ${formatSavedTime(savedAt)}` : '尚未保存'}</div>
        </div>
      </Card>
    </Rnd>
  )
}
