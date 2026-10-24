import { useCallback, useEffect, useState } from "react";
import type { FarmView } from "@my-farm/contracts";
import { freshGuidance, loadGuidance, observeGuidance, persistGuidance } from "../../farmGuidance";

export type FarmGuidanceController = ReturnType<typeof useFarmGuidance>;

/**
 * First-run guidance preferences. Observes the authoritative view (never
 * submits commands) and is disabled for scenario lessons.
 */
export function useFarmGuidance({ view, enabled }: { view: FarmView | null; enabled: boolean }) {
  const [guidance, setGuidance] = useState(loadGuidance);

  useEffect(() => {
    if (view && enabled) {
      setGuidance((previous) => {
        const next = observeGuidance(previous, view);
        persistGuidance(next);
        return next;
      });
    }
  }, [view, enabled]);

  const setDismissed = useCallback((dismissed: boolean) => {
    setGuidance((previous) => {
      const next = { ...previous, dismissed };
      persistGuidance(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    const next = freshGuidance();
    persistGuidance(next);
    setGuidance(next);
  }, []);

  return { enabled, guidance, setDismissed, reset };
}
