import { ThemeProvider } from './components/theme-provider'
import { NoteWindow } from './components/note-window'
import { useSingleNote } from '@/hooks/use-single-note'

interface NoteAppProps {
  noteId: number
}

export function NoteApp({ noteId }: NoteAppProps) {
  const {
    ready,
    note,
    closedNotes,
    savedAt,
    handleUpdate,
    handleClose,
    handleSaveNow,
    handleRestoreNote,
    handleDeleteClosedNote,
    handleNewNote,
  } = useSingleNote(noteId)

  // 加载中或无效窗口：不拦截鼠标，避免透明层挡住其它便签
  if (!ready || !note) {
    return <div className="h-full w-full pointer-events-none" aria-hidden />
  }

  return (
    <ThemeProvider>
      <div className="h-full w-full overflow-hidden rounded-lg">
        <NoteWindow
          variant="standalone"
          note={note}
          zIndex={1}
          savedAt={savedAt}
          closedNotes={closedNotes}
          onUpdate={handleUpdate}
          onClose={() => void handleClose()}
          onSaveNow={handleSaveNow}
          onRestoreNote={id => void handleRestoreNote(id)}
          onDeleteClosedNote={handleDeleteClosedNote}
          onNewNote={handleNewNote}
        />
      </div>
    </ThemeProvider>
  )
}
