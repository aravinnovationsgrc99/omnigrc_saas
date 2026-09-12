'use client';

import React, { useState, useEffect, useRef } from 'react';

interface AnimatedCountUpProps {
  value: number | string;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
}

export function AnimatedCountUp({
  value,
  duration = 500,
  className = '',
  style = {},
}: AnimatedCountUpProps) {
  const [displayValue, setDisplayValue] = useState<number | string>(value);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const isNumber = typeof value === 'number' && !isNaN(value);
    
    // Respect prefers-reduced-motion
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (!isNumber || prefersReducedMotion) {
      setDisplayValue(value);
      return;
    }

    const startValue = typeof displayValue === 'number' ? displayValue : 0;
    const targetValue = value as number;
    if (startValue === targetValue) {
      setDisplayValue(targetValue);
      return;
    }

    const startTime = performance.now();

    const updateCount = (currentTime: number) => {
      const elapsedTime = currentTime - startTime;
      const progress = Math.min(elapsedTime / duration, 1);
      
      // Ease-out cubic formula
      const easedProgress = 1 - Math.pow(1 - progress, 3);
      const currentValue = Math.round(startValue + (targetValue - startValue) * easedProgress);

      setDisplayValue(currentValue);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(updateCount);
      } else {
        setDisplayValue(targetValue);
      }
    };

    frameRef.current = requestAnimationFrame(updateCount);

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [value, duration]);

  return (
    <span className={className} style={style}>
      {displayValue}
    </span>
  );
}
