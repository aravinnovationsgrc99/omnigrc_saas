'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

interface ScrollNavigatorProps {
  scrollContainerRef?: React.RefObject<HTMLElement | null>;
  className?: string;
}

export function ScrollNavigator({ scrollContainerRef, className = '' }: ScrollNavigatorProps) {
  const [progress, setProgress] = useState(0);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const trackRef = useRef<HTMLDivElement>(null);

  // Helper to resolve the scroll target: prop ref, or closest .omni-scroll element, or window
  const getContainer = useCallback((): HTMLElement | null => {
    if (scrollContainerRef?.current) return scrollContainerRef.current;
    if (typeof document !== 'undefined') {
      const el = document.querySelector('.omni-scroll');
      if (el instanceof HTMLElement) return el;
    }
    return null;
  }, [scrollContainerRef]);

  const updateScrollState = useCallback(() => {
    const container = getContainer();
    if (!container) {
      // Fallback to window/document
      if (typeof window === 'undefined') return;
      const scrollHeight = document.documentElement.scrollHeight;
      const clientHeight = window.innerHeight;
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const overflow = scrollHeight > clientHeight + 30;
      setHasOverflow(overflow);
      if (overflow) {
        const pct = Math.min(100, Math.max(0, (scrollTop / (scrollHeight - clientHeight)) * 100));
        setProgress(pct);
      }
      return;
    }

    const { scrollTop, scrollHeight, clientHeight } = container;
    const overflow = scrollHeight > clientHeight + 30;
    setHasOverflow(overflow);
    if (overflow) {
      const pct = Math.min(100, Math.max(0, (scrollTop / (scrollHeight - clientHeight)) * 100));
      setProgress(pct);
    }
  }, [getContainer]);

  useEffect(() => {
    updateScrollState();
    const container = getContainer();
    const target = container || window;

    const handleScroll = () => {
      updateScrollState();
    };

    target.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', updateScrollState);

    // Mutation observer to detect content height changes
    let observer: MutationObserver | null = null;
    const isNode = container && (container instanceof Node || Boolean((container as any).nodeType));
    if (container && typeof MutationObserver !== 'undefined' && isNode) {
      observer = new MutationObserver(() => {
        updateScrollState();
      });
      try {
        observer.observe(container, { childList: true, subtree: true, attributes: true });
      } catch {
        // Fallback for mocked container environments
      }
    }

    return () => {
      target.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', updateScrollState);
      if (observer) observer.disconnect();
    };
  }, [getContainer, updateScrollState]);

  const prefersReducedMotion = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  };

  const scrollToPosition = (pct: number) => {
    const container = getContainer();
    const behavior = prefersReducedMotion() ? 'auto' : 'smooth';
    const targetPct = Math.min(100, Math.max(0, pct));

    if (container) {
      const maxScroll = container.scrollHeight - container.clientHeight;
      container.scrollTo({
        top: (targetPct / 100) * maxScroll,
        behavior,
      });
    } else if (typeof window !== 'undefined') {
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      window.scrollTo({
        top: (targetPct / 100) * maxScroll,
        behavior,
      });
    }
  };

  const handleTrackClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const pct = (clickY / rect.height) * 100;
    scrollToPosition(pct);
  };

  // Drag handling
  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (!trackRef.current) return;
      const rect = trackRef.current.getBoundingClientRect();
      const clientY = Math.max(rect.top, Math.min(rect.bottom, e.clientY));
      const pct = ((clientY - rect.top) / rect.height) * 100;
      scrollToPosition(pct);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  // If page doesn't have vertical overflow, render nothing or stay invisible
  if (!hasOverflow) {
    return null;
  }

  return (
    <div
      role="region"
      aria-label="Page scroll navigator"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`fixed right-2.5 top-1/2 -translate-y-1/2 z-30 hidden sm:flex flex-col items-center gap-1.5 p-1.5 rounded-full transition-all duration-200 select-none ${
        hovered || isDragging
          ? 'bg-slate-900/80 shadow-lg backdrop-blur-md text-white'
          : 'bg-white/70 shadow-xs backdrop-blur-xs text-slate-600 border border-slate-200/60'
      } ${className}`}
      style={{
        opacity: hovered || isDragging ? 1 : 0.65,
      }}
    >
      {/* Scroll to Top Button */}
      <button
        type="button"
        onClick={() => scrollToPosition(0)}
        aria-label="Scroll to top of page"
        title="Scroll to top"
        className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors focus-visible:outline-2 focus-visible:outline-teal-500"
      >
        <ChevronUp size={14} strokeWidth={2.5} />
      </button>

      {/* Progress Track */}
      <div
        ref={trackRef}
        onClick={handleTrackClick}
        role="slider"
        aria-label="Vertical scroll position"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress)}
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Home') {
            e.preventDefault();
            scrollToPosition(0);
          } else if (e.key === 'End') {
            e.preventDefault();
            scrollToPosition(100);
          } else if (e.key === 'PageUp' || e.key === 'ArrowUp') {
            e.preventDefault();
            scrollToPosition(progress - 15);
          } else if (e.key === 'PageDown' || e.key === 'ArrowDown') {
            e.preventDefault();
            scrollToPosition(progress + 15);
          }
        }}
        className="relative w-2 h-24 rounded-full cursor-pointer transition-colors focus-visible:outline-2 focus-visible:outline-teal-500"
        style={{
          background: hovered || isDragging ? 'rgba(255, 255, 255, 0.2)' : 'rgba(15, 26, 46, 0.12)',
        }}
        title={`Scroll position: ${Math.round(progress)}%`}
      >
        {/* Thumb */}
        <div
          onMouseDown={(e) => {
            e.stopPropagation();
            setIsDragging(true);
          }}
          className="absolute left-1/2 -translate-x-1/2 w-3.5 h-3.5 rounded-full shadow-md cursor-grab active:cursor-grabbing transition-transform hover:scale-125"
          style={{
            top: `calc(${progress}% - 7px)`,
            background: '#0F6E6A',
            border: '2px solid #FFFFFF',
          }}
        />
      </div>

      {/* Scroll to Bottom Button */}
      <button
        type="button"
        onClick={() => scrollToPosition(100)}
        aria-label="Scroll to bottom of page"
        title="Scroll to bottom"
        className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-white/20 transition-colors focus-visible:outline-2 focus-visible:outline-teal-500"
      >
        <ChevronDown size={14} strokeWidth={2.5} />
      </button>

      {/* Hover tooltip showing percentage */}
      {hovered && (
        <div
          className="absolute right-9 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-900 text-white shadow-md whitespace-nowrap pointer-events-none"
        >
          {Math.round(progress)}%
        </div>
      )}
    </div>
  );
}

