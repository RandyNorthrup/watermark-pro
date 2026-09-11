import { useCallback, useRef, useState } from 'react'

import { HISTORY_LIMIT } from '../../editor/state'

interface History<Value> {
  past: Value[]
  present: Value
  future: Value[]
  start: Value | null
}

function isSame<Value>(a: Value, b: Value): boolean {
  return a === b || JSON.stringify(a) === JSON.stringify(b)
}

/** One bounded history for form fields, kind drafts and grouped canvas gestures. */
export function useDesignHistory<Value>(initial: Value) {
  const [history, setHistory] = useState<History<Value>>({
    past: [],
    present: initial,
    future: [],
    start: null,
  })
  const current = useRef(history)
  const replace = useCallback((next: History<Value>) => {
    current.current = next
    setHistory(next)
  }, [])
  const begin = useCallback(() => {
    const previous = current.current
    if (previous.start === null) replace({ ...previous, start: previous.present })
  }, [replace])
  const end = useCallback(() => {
    const previous = current.current
    if (previous.start === null) return
    const past = isSame(previous.start, previous.present)
      ? previous.past
      : [...previous.past, previous.start].slice(-HISTORY_LIMIT)
    replace({ ...previous, past, start: null })
  }, [replace])
  const change = useCallback(
    (value: Value) => {
      const previous = current.current
      if (isSame(previous.present, value)) return
      replace({
        ...previous,
        past:
          previous.start === null
            ? [...previous.past, previous.present].slice(-HISTORY_LIMIT)
            : previous.past,
        present: value,
        future: [],
      })
    },
    [replace],
  )
  const undo = useCallback(() => {
    end()
    const previous = current.current
    const value = previous.past.at(-1)
    if (value !== undefined)
      replace({
        past: previous.past.slice(0, -1),
        present: value,
        future: [previous.present, ...previous.future],
        start: null,
      })
  }, [end, replace])
  const redo = useCallback(() => {
    end()
    const previous = current.current
    const [value, ...future] = previous.future
    if (value !== undefined)
      replace({ past: [...previous.past, previous.present], present: value, future, start: null })
  }, [end, replace])
  return {
    value: history.present,
    change,
    begin,
    end,
    undo,
    redo,
    canUndo: history.past.length > 0,
    canRedo: history.future.length > 0,
  }
}
