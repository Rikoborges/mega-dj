import { useRef, useCallback, useState } from 'react';

export function useBpmTap(onBpm) {
  const timesRef = useRef([]);
  const [tapCount, setTapCount] = useState(0);

  const tap = useCallback(() => {
    const now = Date.now();
    // Discard taps older than 3 seconds (user paused)
    timesRef.current = [...timesRef.current, now].filter(t => now - t < 3000);
    setTapCount(timesRef.current.length);

    if (timesRef.current.length >= 2) {
      const times = timesRef.current;
      const intervals = times.slice(1).map((t, i) => t - times[i]);
      const avg = intervals.reduce((a, b) => a + b) / intervals.length;
      const bpm = Math.round(60000 / avg);
      if (bpm >= 50 && bpm <= 220) onBpm(bpm);
    }
  }, [onBpm]);

  const reset = useCallback(() => {
    timesRef.current = [];
    setTapCount(0);
  }, []);

  return { tap, reset, tapCount };
}
