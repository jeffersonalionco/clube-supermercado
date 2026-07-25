import { useCallback, useRef, useState } from "react";

const THRESHOLD = 72;

export function usePullToRefresh(onRefresh, { disabled = false } = {}) {
  const [pullY, setPullY] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const startY = useRef(0);
  const pulling = useRef(false);
  const pullYRef = useRef(0);

  const canPull = useCallback(() => {
    if (disabled || refreshing) return false;
    return window.scrollY <= 4;
  }, [disabled, refreshing]);

  const onTouchStart = useCallback(
    (event) => {
      if (!canPull()) return;
      startY.current = event.touches[0].clientY;
      pulling.current = true;
    },
    [canPull]
  );

  const onTouchMove = useCallback(
    (event) => {
      if (!pulling.current || !canPull()) return;
      const delta = event.touches[0].clientY - startY.current;
      if (delta > 0) {
        const next = Math.min(delta * 0.45, THRESHOLD + 24);
        pullYRef.current = next;
        setPullY(next);
        if (delta > 12) event.preventDefault();
      }
    },
    [canPull]
  );

  const onTouchEnd = useCallback(async () => {
    if (!pulling.current) return;
    pulling.current = false;

    const released = pullYRef.current;

    if (released >= THRESHOLD && onRefresh) {
      setRefreshing(true);
      setPullY(THRESHOLD * 0.6);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
        pullYRef.current = 0;
        setPullY(0);
      }
      return;
    }

    pullYRef.current = 0;
    setPullY(0);
  }, [onRefresh]);

  const ready = pullY >= THRESHOLD;

  return {
    pullY,
    refreshing,
    ready,
    handlers: {
      onTouchStart,
      onTouchMove,
      onTouchEnd,
    },
  };
}
