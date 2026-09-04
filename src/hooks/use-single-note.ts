import { useCallback, useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { invoke } from '@tauri-apps/api/core'
import {
  readNotesState,
  patchNoteInStore,
  restoreNoteInStoreAsync,
  deleteClosedNoteInStoreAsync,
  touchNoteSavedAtAsync,
  hydrateNotesFromRust,
} from '@/lib/notes-api'
import type { Note } from '@/lib/note-storage'
import {
  createNewNote,
  setNoteAlwaysOnTop,
  updateNoteWindow,
  isTauri,
  getAppSettings,
  quitApp,
} from '@/lib/tauri'
import { getCurrentWindow } from '@tauri-apps/api/window'

export function useSingleNote(noteId: number) {
  const [ready, setReady] = useState(!isTauri())
  const [note, setNote] = useState<Note | null>(null)
  const [closedNotes, setClosedNotes] = useState<Note[]>([])
  const [savedAt, setSavedAt] = useState<number | undefined>()
  const noteRef = useRef<Note | null>(null)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const moveTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const resizeTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const closingRef = useRef(false)
  const creatingRef = useRef(false)

  const refresh = useCallback(() => {
    const state = readNotesState()
    const current = state.notes.find(item => item.id === noteId) ?? null
    if (!current) {
      if (!closingRef.current) {
        closingRef.current = true
        void getCurrentWindow().destroy()
      }
      return
    }
    setNote(current)
    setClosedNotes(state.closedNotes)
    setSavedAt(state.savedAtMap[noteId])
    noteRef.current = current
  }, [noteId])

  useEffect(() => {
    if (!isTauri()) {
      refresh()
      return
    }
    void hydrateNotesFromRust().then(ok => {
      if (!ok) {
        closingRef.current = true
        void getCurrentWindow().destroy()
        return
      }
      const state = readNotesState()
      if (!state.notes.some(item => item.id === noteId)) {
        closingRef.current = true
        void getCurrentWindow().destroy()
        return
      }
      refresh()
      setReady(true)
    })
  }, [noteId, refresh])

  useEffect(() => {
    if (!isTauri()) return
    let hydrateTimer: ReturnType<typeof setTimeout> | undefined
    const unsubs: Array<() => void> = []
    void (async () => {
      unsubs.push(
        await listen('notes-changed', () => {
          if (closingRef.current) return
          if (hydrateTimer) clearTimeout(hydrateTimer)
          hydrateTimer = setTimeout(() => {
            void hydrateNotesFromRust().then(() => refresh())
          }, 120)
        }),
      )
    })()
    return () => {
      if (hydrateTimer) clearTimeout(hydrateTimer)
      unsubs.forEach(u => u())
    }
  }, [refresh])

  const flushPendingSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = undefined
    }
    if (!noteRef.current) return
    const state = await patchNoteInStore(noteId, noteRef.current)
    setSavedAt(state.savedAtMap[noteId] ?? Date.now())
  }, [noteId])

  useEffect(() => {
    if (!ready || !note) return

    const appWindow = getCurrentWindow()

    const unlistenMoved = appWindow.onMoved(() => {
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
      moveTimerRef.current = setTimeout(() => {
        void (async () => {
          const [outer, factor] = await Promise.all([
            appWindow.outerPosition(),
            appWindow.scaleFactor(),
          ])
          const logical = outer.toLogical(factor)
          const position = { x: logical.x, y: logical.y }
          if (!noteRef.current) return
          const next = { ...noteRef.current, position }
          noteRef.current = next
          setNote(next)
          void patchNoteInStore(noteId, { position })
        })()
      }, 200)
    })

    const unlistenResized = appWindow.onResized(() => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
      resizeTimerRef.current = setTimeout(() => {
        void (async () => {
          const [inner, factor] = await Promise.all([
            appWindow.innerSize(),
            appWindow.scaleFactor(),
          ])
          const logical = inner.toLogical(factor)
          const size = {
            width: Math.round(logical.width),
            height: Math.round(logical.height),
          }
          if (!noteRef.current) return
          if (
            noteRef.current.size.width === size.width &&
            noteRef.current.size.height === size.height
          ) {
            return
          }
          const next = { ...noteRef.current, size }
          noteRef.current = next
          setNote(next)
          void patchNoteInStore(noteId, { size })
        })()
      }, 200)
    })

    return () => {
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
      void unlistenMoved.then(unlisten => unlisten())
      void unlistenResized.then(unlisten => unlisten())
    }
  }, [ready, note, noteId])

  const handleUpdate = useCallback(
    (updates: Partial<Note>) => {
      if (!noteRef.current) return
      const next = { ...noteRef.current, ...updates }
      noteRef.current = next
      setNote(next)

      if (updates.isPinned !== undefined) {
        void setNoteAlwaysOnTop(noteId, next.isPinned)
      }
      if (updates.size || updates.title) {
        void updateNoteWindow(next)
      }

      if (updates.position) return

      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        if (!noteRef.current) return
        const snapshot = noteRef.current
        void patchNoteInStore(noteId, snapshot)
          .then(state => {
            setSavedAt(state.savedAtMap[noteId] ?? Date.now())
          })
          .catch(error => {
            console.error('[note] autosave failed:', error)
          })
      }, 500)
    },
    [noteId],
  )

  const handleClose = useCallback(async () => {
    if (closingRef.current) return

    const state = readNotesState()
    const isLastOpenNote =
      state.notes.length === 1 && state.notes[0].id === noteId
    let shouldQuit = false

    if (isLastOpenNote && isTauri()) {
      const settings = await getAppSettings()
      if (settings?.lastNoteClose === 'quit-app') {
        shouldQuit = true
      } else if (settings?.lastNoteClose === 'confirm-quit') {
        shouldQuit = window.confirm(
          '这是最后一张便签。\n\n关闭后是否退出应用？\n\n选择「取消」将仅关闭便签，托盘继续运行。',
        )
      }
    }

    closingRef.current = true
    try {
      await flushPendingSave().catch(() => {})
      await invoke('close_note_data_cmd', { noteId })
      await getCurrentWindow().destroy()
      if (shouldQuit) {
        await quitApp()
      }
    } catch (error) {
      closingRef.current = false
      console.error('[note] close failed:', error)
    }
  }, [noteId, flushPendingSave])

  const handleSaveNow = useCallback(() => {
    void flushPendingSave().then(() => {
      if (!noteRef.current) return
      void touchNoteSavedAtAsync(noteId).then(state => {
        setSavedAt(state.savedAtMap[noteId])
      })
    })
  }, [flushPendingSave, noteId])

  const handleRestoreNote = useCallback(async (restoreId: number) => {
    await restoreNoteInStoreAsync(restoreId)
    refresh()
  }, [refresh])

  const handleDeleteClosedNote = useCallback(
    (deleteId: number) => {
      void deleteClosedNoteInStoreAsync(deleteId).then(() => refresh())
    },
    [refresh],
  )

  const handleNewNote = useCallback(() => {
    if (creatingRef.current) return
    creatingRef.current = true
    void createNewNote()
      .catch(error => {
        console.error('[note] create failed:', error)
      })
      .finally(() => {
        creatingRef.current = false
      })
  }, [])

  useEffect(() => {
    return () => {
      if (closingRef.current) return
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = undefined
      }
      if (moveTimerRef.current) clearTimeout(moveTimerRef.current)
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current)
      // Flush pending edits so HMR / unexpected unmount does not drop debounce window.
      if (noteRef.current) {
        void patchNoteInStore(noteId, noteRef.current)
      }
    }
  }, [noteId])

  return {
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
  }
}
