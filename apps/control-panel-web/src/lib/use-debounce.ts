import { useState, useEffect } from 'react';

/**
 * Custom hook to debounce a fast-changing value (e.g. search input).
 * Reduces unnecessary re-filtering and DOM re-renders.
 */
export function useDebounce<T>(value: T, delayMs: number = 200): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delayMs]);

  return debouncedValue;
}

