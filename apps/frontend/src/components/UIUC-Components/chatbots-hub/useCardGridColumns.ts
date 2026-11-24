import { useCallback, useState } from 'react'

export const MAX_CARD_COLUMNS = 5
const MIN_CARD_WIDTH = 240
const GRID_GAP = 20

const columnsForWidth = (width: number) =>
  Math.min(
    MAX_CARD_COLUMNS,
    Math.max(1, Math.floor((width + GRID_GAP) / (MIN_CARD_WIDTH + GRID_GAP))),
  )

// Shared by sections and search results so cards are the same width in both.
export function useCardGridColumns() {
  const [columns, setColumns] = useState(MAX_CARD_COLUMNS)

  // Callback ref: measures during commit (before paint) and handles a grid that mounts late.
  const ref = useCallback((el: HTMLDivElement | null) => {
    if (!el) return
    const update = () => {
      if (el.clientWidth > 0) setColumns(columnsForWidth(el.clientWidth))
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return { ref, columns }
}
