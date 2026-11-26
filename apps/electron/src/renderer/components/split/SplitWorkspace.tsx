/**
 * SplitWorkspace - 主内容区 + 右侧分栏的可拖拽布局
 *
 * 分栏展开时，中间出现拖拽条可调整宽度（320 ~ 900px）。
 */

import * as React from 'react'
import { useAtomValue } from 'jotai'
import { cn } from '@/lib/utils'
import { splitPanelAtom } from '@/atoms/split-panel'
import { SplitPanel } from './SplitPanel'

const MIN_WIDTH = 320
const MAX_WIDTH = 900
const DEFAULT_WIDTH = 520

export function SplitWorkspace({ children }: { children: React.ReactNode }): React.ReactElement {
  const { open } = useAtomValue(splitPanelAtom)
  const [width, setWidth] = React.useState(DEFAULT_WIDTH)
  const [dragging, setDragging] = React.useState(false)
  const dragStartRef = React.useRef({ x: 0, width: DEFAULT_WIDTH })

  React.useEffect(() => {
    if (!dragging) return

    const handleMove = (event: MouseEvent): void => {
      const delta = event.clientX - dragStartRef.current.x
      // 分栏在右侧：向左拖动变宽
      const next = dragStartRef.current.width - delta
      setWidth(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, next)))
    }
    const handleUp = (): void => setDragging(false)

    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [dragging])

  return (
    <div className={cn('flex h-full gap-1.5 min-w-0', dragging && 'select-none')}>
      <div className="flex-1 min-w-0">{children}</div>

      {open && (
        <>
          <div
            role="separator"
            aria-orientation="vertical"
            onMouseDown={(event) => {
              dragStartRef.current = { x: event.clientX, width }
              setDragging(true)
              event.preventDefault()
            }}
            className={cn(
              'w-1.5 shrink-0 cursor-col-resize rounded-full transition-colors',
              dragging ? 'bg-primary/40' : 'bg-transparent hover:bg-foreground/10'
            )}
          />
          <div style={{ width }} className="shrink-0 min-w-0">
            <SplitPanel />
          </div>
        </>
      )}
    </div>
  )
}
