import { useState } from "react";

export function useReorderedItems<T>(source: T[]) {
  const [localOrder, setLocalOrder] = useState<{ source: T[]; items: T[] } | null>(null);

  // Keep the drag order only until the parent supplies a new list.
  if (localOrder && localOrder.source !== source) {
    setLocalOrder(null);
  }

  const items = localOrder?.source === source ? localOrder.items : source;

  function reorder(from: number, to: number) {
    if (from === to || from < 0 || from >= items.length || to < 0 || to >= items.length) return;
    const nextItems = [...items];
    const moved = nextItems.splice(from, 1);
    nextItems.splice(to, 0, ...moved);
    setLocalOrder({ source, items: nextItems });
  }

  return { items, reorder };
}
