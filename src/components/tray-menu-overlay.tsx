import { useEffect, useState } from 'react'
import { PlusCircle, Moon, LogOut, Palette, ChevronRight, StickyNote } from 'lucide-react'
import { useTheme } from './theme-provider'
import { cn } from '@/lib/utils'
import { sendCommand } from '@/lib/tauri'
import { NOTE_THEMES, type NoteThemeId } from '@/lib/note-themes'

export { NOTE_THEMES, type NoteThemeId }

interface TrayMenuOverlayProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Which tray button opened the menu; left-click now shows notes directly. */
  openedBy?: 'left' | 'right'
  onShowNotes?: () => void
  onApplyNoteTheme?: (theme: NoteThemeId) => void
  onCycleNoteTheme?: () => void
}

function MenuItem({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode
  onClick?: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative flex w-full cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground',
        className,
      )}
    >
      {children}
    </button>
  )
}

function MenuSeparator() {
  return <div className="-mx-1 my-1 h-px bg-muted" />
}

export function TrayMenuOverlay({
  open,
  onOpenChange,
  openedBy = 'right',
  onShowNotes,
  onApplyNoteTheme,
  onCycleNoteTheme,
}: TrayMenuOverlayProps) {
  const { theme, setTheme } = useTheme()
  const [colorSubmenuOpen, setColorSubmenuOpen] = useState(false)

  useEffect(() => {
    if (!open) {
      setColorSubmenuOpen(false)
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (!target.closest('[data-tray-menu]')) {
        onOpenChange(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [open, onOpenChange])

  if (!open) return null

  const close = () => onOpenChange(false)

  const handleShowNotes = () => {
    close()
    if (onShowNotes) {
      onShowNotes()
    } else {
      void sendCommand('tray-show-notes')
    }
  }

  const handleCycleTheme = () => {
    if (onCycleNoteTheme) {
      onCycleNoteTheme()
    } else if (onApplyNoteTheme) {
      onApplyNoteTheme(NOTE_THEMES[0].id)
    }
  }

  return (
    <div
      className={cn(
        'fixed z-[9999]',
        openedBy === 'left' ? 'bottom-4 right-4' : 'bottom-4 right-4',
      )}
      data-tray-menu
    >
      <div className="w-56 min-w-[8rem] overflow-visible rounded-md border bg-popover p-1 text-popover-foreground shadow-md">
        <MenuItem onClick={handleShowNotes}>
          <StickyNote className="mr-2 h-4 w-4" />
          <span>显示便签</span>
        </MenuItem>

        <MenuItem
          onClick={() => {
            close()
            sendCommand('tray-new-note')
          }}
        >
          <PlusCircle className="mr-2 h-4 w-4" />
          <span>新建便签</span>
        </MenuItem>

        <MenuSeparator />

        <div className="relative">
          <MenuItem
            className="justify-between"
            onClick={() => setColorSubmenuOpen(v => !v)}
          >
            <span className="flex items-center">
              <Palette className="mr-2 h-4 w-4" />
              <span>快速颜色切换</span>
            </span>
            <ChevronRight
              className={cn('h-4 w-4 opacity-60 transition-transform', colorSubmenuOpen && 'rotate-90')}
            />
          </MenuItem>

          {colorSubmenuOpen ? (
            <div className="ml-2 border-l border-muted pl-1">
              {NOTE_THEMES.map(item => (
                <MenuItem
                  key={item.id}
                  className="text-xs"
                  onClick={() => {
                    onApplyNoteTheme?.(item.id)
                    close()
                  }}
                >
                  {item.label}
                </MenuItem>
              ))}
              <MenuItem
                className="text-xs text-muted-foreground"
                onClick={() => {
                  handleCycleTheme()
                  close()
                }}
              >
                循环切换
              </MenuItem>
            </div>
          ) : null}
        </div>

        <MenuItem
          onClick={() => {
            setTheme(theme === 'dark' ? 'light' : 'dark')
          }}
        >
          <Moon className="mr-2 h-4 w-4" />
          <span>切换暗色模式</span>
        </MenuItem>

        <MenuSeparator />

        <MenuItem onClick={() => void sendCommand('tray-quit')}>
          <LogOut className="mr-2 h-4 w-4" />
          <span>退出应用</span>
        </MenuItem>
      </div>
    </div>
  )
}
