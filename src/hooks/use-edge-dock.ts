import { useCallback, useEffect, useRef, useState } from 'react'
import { getCurrentWindow } from '@tauri-apps/api/window'
import {
  animateNoteWindowPosition,
  evaluateNoteEdgeDock,
  isTauri,
  type EdgeDockPlan,
} from '@/lib/tauri'

const HIDE_DELAY_MS = 10_000
const ANIM_MS = 320

/**
 * Pinned notes near screen edges collapse to a bookmark tab (logo + title).
 * Hover expands immediately; leave + blur for 10s hides again.
 */
export function useEdgeDock(
  noteId: number,
  isPinned: boolean,
  suppressPositionPersistRef: React.MutableRefObject<boolean>,
) {
  const [docked, setDocked] = useState(false)
  const [edge, setEdge] = useState<EdgeDockPlan['edge'] | null>(null)
  const planRef = useRef<EdgeDockPlan | null>(null)
  const dockedRef = useRef(false)
  const animatingRef = useRef(false)
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>()
  const pointerInsideRef = useRef(false)
  const focusedRef = useRef(true)

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current)
      hideTimerRef.current = undefined
    }
  }, [])

  const expand = useCallback(async () => {
    clearHideTimer()
    const plan = planRef.current
    if (!plan || !dockedRef.current || animatingRef.current) return
    animatingRef.current = true
    suppressPositionPersistRef.current = true
    // Show full note chrome first so expand morphs content, not a stretched bookmark.
    dockedRef.current = false
    setDocked(false)
    try {
      await animateNoteWindowPosition(
        noteId,
        plan.restX,
        plan.restY,
        ANIM_MS,
        plan.restW,
        plan.restH,
        plan.edge,
      )
    } finally {
      animatingRef.current = false
      suppressPositionPersistRef.current = false
    }
  }, [clearHideTimer, noteId, suppressPositionPersistRef])

  const hide = useCallback(async (force = false) => {
    const plan = planRef.current
    if (!plan || !isPinned || animatingRef.current) return
    if (!force && (pointerInsideRef.current || focusedRef.current)) return
    animatingRef.current = true
    suppressPositionPersistRef.current = true
    // Switch to bookmark chrome first so collapse doesn't squash the editor.
    dockedRef.current = true
    setDocked(true)
    setEdge(plan.edge)
    try {
      await animateNoteWindowPosition(
        noteId,
        plan.hideX,
        plan.hideY,
        ANIM_MS,
        plan.hideW,
        plan.hideH,
        plan.edge,
      )
    } finally {
      animatingRef.current = false
    }
  }, [isPinned, noteId, suppressPositionPersistRef])

  const scheduleHide = useCallback(() => {
    clearHideTimer()
    if (!isPinned || !planRef.current) return
    hideTimerRef.current = setTimeout(() => {
      void hide(false)
    }, HIDE_DELAY_MS)
  }, [clearHideTimer, hide, isPinned])

  const tryDockAfterMove = useCallback(async () => {
    if (!isTauri() || !isPinned || animatingRef.current) return
    const plan = await evaluateNoteEdgeDock(noteId)
    if (!plan) {
      planRef.current = null
      setEdge(null)
      if (dockedRef.current) {
        dockedRef.current = false
        setDocked(false)
        suppressPositionPersistRef.current = false
      }
      return
    }
    planRef.current = plan
    setEdge(plan.edge)
    clearHideTimer()
    await hide(true)
  }, [clearHideTimer, hide, isPinned, noteId, suppressPositionPersistRef])

  const onUserActivity = useCallback(() => {
    clearHideTimer()
    if (dockedRef.current) {
      void expand()
    }
  }, [clearHideTimer, expand])

  // Unpin → force expand and clear dock plan.
  useEffect(() => {
    if (isPinned) return
    clearHideTimer()
    if (dockedRef.current && planRef.current) {
      const plan = planRef.current
      void (async () => {
        animatingRef.current = true
        suppressPositionPersistRef.current = true
        dockedRef.current = false
        setDocked(false)
        try {
          await animateNoteWindowPosition(
            noteId,
            plan.restX,
            plan.restY,
            ANIM_MS,
            plan.restW,
            plan.restH,
            plan.edge,
          )
        } finally {
          animatingRef.current = false
          planRef.current = null
          setEdge(null)
          suppressPositionPersistRef.current = false
        }
      })()
    } else {
      planRef.current = null
      setEdge(null)
      suppressPositionPersistRef.current = false
    }
  }, [clearHideTimer, isPinned, noteId, suppressPositionPersistRef])

  useEffect(() => {
    if (!isTauri() || !isPinned) return

    const root = document.documentElement
    const onEnter = () => {
      pointerInsideRef.current = true
      clearHideTimer()
      void expand()
    }
    const onLeave = () => {
      pointerInsideRef.current = false
      if (!focusedRef.current) scheduleHide()
    }
    root.addEventListener('mouseenter', onEnter)
    root.addEventListener('mouseleave', onLeave)

    const appWindow = getCurrentWindow()
    const unFocus = appWindow.onFocusChanged(({ payload: focused }) => {
      focusedRef.current = focused
      if (focused) {
        clearHideTimer()
        void expand()
      } else if (!pointerInsideRef.current) {
        scheduleHide()
      }
    })

    return () => {
      root.removeEventListener('mouseenter', onEnter)
      root.removeEventListener('mouseleave', onLeave)
      void unFocus.then(u => u())
      clearHideTimer()
    }
  }, [clearHideTimer, expand, isPinned, scheduleHide])

  useEffect(() => {
    return () => clearHideTimer()
  }, [clearHideTimer])

  return {
    docked,
    edge,
    tryDockAfterMove,
    onUserActivity,
    expand,
  }
}
