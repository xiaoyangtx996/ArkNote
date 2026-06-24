import { useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import { cursorPosition, getCurrentWindow } from '@tauri-apps/api/window'
import { isTauri, setMousePassthrough } from '@/lib/tauri'

const POINTER_MOVE_THROTTLE_MS = 32
const PASSTHROUGH_POLL_MS = 150

function isInteractiveTarget(target: Element | null) {
  if (!target) return false
  return Boolean(
    target.closest('[data-note-window]') ||
      target.closest('[data-tray-menu]') ||
      target.closest('[data-radix-popper-content-wrapper]') ||
      target.closest('[data-radix-tooltip-content]') ||
      target.closest('[role="menu"]') ||
      target.closest('[role="tooltip"]'),
  )
}

function throttle<T extends (...args: never[]) => void>(fn: T, ms: number): T {
  let lastCall = 0
  let timeout: ReturnType<typeof setTimeout> | null = null

  return ((...args: Parameters<T>) => {
    const now = Date.now()
    const remaining = ms - (now - lastCall)

    if (remaining <= 0) {
      if (timeout) {
        clearTimeout(timeout)
        timeout = null
      }
      lastCall = now
      fn(...args)
      return
    }

    if (!timeout) {
      timeout = setTimeout(() => {
        lastCall = Date.now()
        timeout = null
        fn(...args)
      }, remaining)
    }
  }) as T
}

export function useMousePassthrough() {
  useEffect(() => {
    if (!isTauri()) return

    let passthrough = false
    let pollTimer: ReturnType<typeof setInterval> | null = null

    const syncPassthrough = (enabled: boolean) => {
      if (passthrough === enabled) return
      passthrough = enabled
      void setMousePassthrough(enabled)

      if (enabled) {
        if (!pollTimer) {
          pollTimer = setInterval(() => {
            void checkCursorRecovery()
          }, PASSTHROUGH_POLL_MS)
        }
      } else if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
    }

    const updateFromPoint = (x: number, y: number) => {
      syncPassthrough(!isInteractiveTarget(document.elementFromPoint(x, y)))
    }

    const checkCursorRecovery = async () => {
      if (!passthrough) return

      try {
        const appWindow = getCurrentWindow()
        const [pos, innerPos, scaleFactor] = await Promise.all([
          cursorPosition(),
          appWindow.innerPosition(),
          appWindow.scaleFactor(),
        ])

        const logical = pos.toLogical(scaleFactor)
        const innerLogical = innerPos.toLogical(scaleFactor)
        updateFromPoint(logical.x - innerLogical.x, logical.y - innerLogical.y)
      } catch {
        // Ignore cursor lookup failures; focus/tray events still recover passthrough.
      }
    }

    const onPointerMove = throttle((e: PointerEvent) => {
      updateFromPoint(e.clientX, e.clientY)
    }, POINTER_MOVE_THROTTLE_MS)

    const onPointerDown = (e: PointerEvent) => {
      updateFromPoint(e.clientX, e.clientY)
    }

    syncPassthrough(false)

    document.addEventListener('pointermove', onPointerMove)
    document.addEventListener('pointerdown', onPointerDown)

    const unlistenFocus = getCurrentWindow()
      .onFocusChanged(({ payload: focused }) => {
        if (focused) {
          syncPassthrough(false)
          void checkCursorRecovery()
        }
      })
      .then(fn => fn)

    const unlistenTrayToggle = listen('tray-menu-toggle', () => {
      syncPassthrough(false)
    }).then(fn => fn)

    return () => {
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerdown', onPointerDown)
      if (pollTimer) {
        clearInterval(pollTimer)
        pollTimer = null
      }
      void unlistenFocus.then(unlisten => unlisten())
      void unlistenTrayToggle.then(unlisten => unlisten())
    }
  }, [])
}
