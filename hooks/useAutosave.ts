import { useEffect, useRef, useCallback } from "react";

type SaveFunction<T> = (data: T) => Promise<void>;

export function useAutosave<T>(data: T, onSave: SaveFunction<T>, delay: number = 800) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitialMount = useRef(true);
  const previousDataRef = useRef<string>(JSON.stringify(data));

  const save = useCallback(async () => {
    await onSave(data);
  }, [data, onSave]);

  useEffect(() => {
    // Skip saving on initial mount
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    // Check if data actually changed
    const currentData = JSON.stringify(data);
    if (currentData === previousDataRef.current) {
      return;
    }
    previousDataRef.current = currentData;

    // Clear existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout for debounced save
    timeoutRef.current = setTimeout(() => {
      save();
    }, delay);

    // Cleanup function cancels pending saves
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [data, save, delay]);
}
