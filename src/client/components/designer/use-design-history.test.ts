import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { useDesignHistory } from './use-design-history'

describe('designer history', () => {
  it('groups hundreds of canvas changes into one undo step and restores the final redo', () => {
    const { result } = renderHook(() => useDesignHistory({ x: 0, name: 'Original' }))
    act(() => {
      result.current.begin()
      for (let x = 1; x <= 100; x += 1) result.current.change({ x, name: 'Original' })
      result.current.end()
    })
    expect(result.current.value.x).toBe(100)
    act(() => result.current.undo())
    expect(result.current.value).toEqual({ x: 0, name: 'Original' })
    expect(result.current.canUndo).toBe(false)
    act(() => result.current.redo())
    expect(result.current.value.x).toBe(100)
  })

  it('records form changes, clears redo on a new branch, and ignores a no-op gesture', () => {
    const { result } = renderHook(() => useDesignHistory('Initial'))
    act(() => {
      result.current.begin()
      result.current.change('Initial')
      result.current.end()
    })
    expect(result.current.canUndo).toBe(false)
    act(() => result.current.change('Name edit'))
    act(() => result.current.undo())
    expect(result.current.value).toBe('Initial')
    expect(result.current.canRedo).toBe(true)
    act(() => result.current.change('New text'))
    expect(result.current.canRedo).toBe(false)
    act(() => result.current.redo())
    expect(result.current.value).toBe('New text')
  })
})
