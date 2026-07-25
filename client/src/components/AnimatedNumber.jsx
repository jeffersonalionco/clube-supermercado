import { useEffect, useRef, useState } from "react";

export default function AnimatedNumber({ value, duration = 700, className = "" }) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    const start = prev.current;
    const target = Number(value) || 0;
    if (start === target) {
      setDisplay(target);
      return undefined;
    }

    const t0 = performance.now();

    function frame(now) {
      const progress = Math.min(1, (now - t0) / duration);
      const eased = 1 - (1 - progress) ** 3;
      const next = Math.round(start + (target - start) * eased);
      setDisplay(next);
      if (progress < 1) {
        requestAnimationFrame(frame);
      } else {
        prev.current = target;
      }
    }

    const id = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(id);
  }, [value, duration]);

  return <span className={className}>{display.toLocaleString("pt-BR")}</span>;
}
