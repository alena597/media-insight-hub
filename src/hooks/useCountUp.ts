import { useEffect, useRef, useState } from 'react';

/**
 * Анімує числове значення від 0 до target з ease-out ефектом.
 *
 * @param target - Кінцеве значення.
 * @param duration - Тривалість анімації в мс.
 * @returns Поточне анімоване значення.
 */
export function useCountUp(target: number, duration = 900): number {
  const [value, setValue] = useState(0);
  const prevRef = useRef(-1);
  useEffect(() => {
    if (target === prevRef.current) return;
    prevRef.current = target;
    if (target === 0) { setValue(0); return; }
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      setValue(Math.round((1 - Math.pow(1 - p, 3)) * target));
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return value;
}
