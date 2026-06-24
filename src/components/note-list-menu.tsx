import { LayoutList, X } from 'lucide-react'
import { Button } from './ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from './ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from './ui/tooltip'
import { cn } from '@/lib/utils'
import type { Note } from '@/lib/note-storage'

interface NoteListMenuProps {
  closedNotes: Note[]
  onRestore: (noteId: number) => void
  onDelete: (noteId: number) => void
}

export function NoteListMenu({ closedNotes, onRestore, onDelete }: NoteListMenuProps) {
  return (
    <DropdownMenu modal={false}>
      <Tooltip>
        <TooltipTrigger asChild>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-6 w-6">
              <LayoutList size={14} />
            </Button>
          </DropdownMenuTrigger>
        </TooltipTrigger>
        <TooltipContent side="bottom">便签列表</TooltipContent>
      </Tooltip>
      <DropdownMenuContent align="end" className="w-56 p-1">
        {closedNotes.length === 0 ? (
          <div className="px-2 py-2 text-xs text-muted-foreground">暂无已关闭便签</div>
        ) : (
          closedNotes.map(note => (
            <div
              key={note.id}
              className="flex items-center gap-0.5 rounded-sm hover:bg-accent"
            >
              <button
                type="button"
                className="min-w-0 flex-1 truncate px-2 py-1.5 text-left text-sm outline-none"
                title={note.title}
                onClick={() => onRestore(note.id)}
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
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
