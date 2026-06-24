import { invoke } from '@tauri-apps/api/core'
import { listen, type UnlistenFn } from '@tauri-apps/api/event'

export const isTauri = () => '__TAURI_INTERNALS__' in window

type EventHandler = () => void

export async function bindAppEvents(handlers: {
  onNewNote: EventHandler
  onTrayMenuToggle: EventHandler
  onTrayMenuHide: EventHandler
  onShowNotes: EventHandler
}): Promise<UnlistenFn[]> {
  const unlisteners = await Promise.all([
    listen('new-note', handlers.onNewNote),
    listen('tray-menu-toggle', handlers.onTrayMenuToggle),
    listen('tray-menu-hide', handlers.onTrayMenuHide),
    listen('tray-show-notes', handlers.onShowNotes),
  ])

  await invoke('renderer_ready')

  return unlisteners
}

export async function sendCommand(
  channel: string,
  ...args: unknown[]
): Promise<void> {
  if (!isTauri()) return

  switch (channel) {
    case 'tray-new-note':
      await invoke('request_tray_new_note')
      break
    case 'hide-main-window':
      await invoke('hide_main_window_cmd')
      break
    case 'tray-quit':
      await invoke('quit_app')
      break
    case 'tray-show-notes':
      await invoke('show_notes_cmd')
      break
    case 'set-always-on-top':
      await invoke('set_always_on_top', { always_on_top: args[0] })
      break
    default:
      break
  }
}

export async function setMousePassthrough(enabled: boolean): Promise<void> {
  if (!isTauri()) return
  await invoke('set_ignore_cursor_events', { ignore: enabled })
}

export async function ensureWindowInteractive(): Promise<void> {
  await setMousePassthrough(false)
}
