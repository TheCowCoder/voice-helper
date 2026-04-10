import React, { useState, useEffect, useRef, useImperativeHandle, forwardRef } from 'react';

export interface PipelineTimerHandle {
  /** Reset elapsed to 0 */
  reset(): void;
}

interface PipelineTimerProps {
  running: boolean;
  className?: string;
}

export const PipelineTimer = forwardRef<PipelineTimerHandle, PipelineTimerProps>(({ running, className = '' }, ref) => {
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number>(0);
  const frozenRef = useRef(0);

  useImperativeHandle(ref, () => ({
    reset() {
      cancelAnimationFrame(rafRef.current);
      setElapsed(0);
      startRef.current = null;
      frozenRef.current = 0;
    },
  }));

  useEffect(() => {
    if (running) {
      startRef.current = Date.now();
      setElapsed(0);
      const tick = () => {
        if (startRef.current) {
          const e = Date.now() - startRef.current;
          setElapsed(e);
          frozenRef.current = e;
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } else {
      cancelAnimationFrame(rafRef.current);
      // Show the frozen value
      setElapsed(frozenRef.current);
    }
    return () => cancelAnimationFrame(rafRef.current);
  }, [running]);

  const secs = Math.floor(elapsed / 1000);
  const mins = Math.floor(secs / 60);
  const display = `${mins}:${String(secs % 60).padStart(2, '0')}`;

  if (elapsed === 0 && !running) return null;

  return (
    <span className={`font-mono tabular-nums ${className}`}>
      {display}
    </span>
  );
});
