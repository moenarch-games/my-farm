import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { FarmClient, FarmConnectionStatus } from "@my-farm/game-client";
import type { CatalogDocument, FarmView } from "@my-farm/contracts";
import {
  connectionStatusMessage,
  createFarmCommandRunner,
  shouldApplyFarmSnapshot,
  type ApplyFarmSnapshot,
} from "./farmCommandRunner";

const clockIntervalMs = 2500;

export type FarmRuntime = ReturnType<typeof useFarmRuntime>;

/**
 * Owns synchronization with the authoritative farm (local server or WASM
 * demo): catalog, versioned snapshots, connection status, the UI clock, the
 * status message and the command boundary. It holds no gameplay state of its own.
 */
export function useFarmRuntime({
  client,
  initialMessage,
  loadedMessage,
}: {
  client: FarmClient;
  initialMessage: string;
  loadedMessage: string;
}) {
  const demoMode = client.runtime === "wasm_demo";
  const [catalog, setCatalog] = useState<CatalogDocument | null>(null);
  const [view, setView] = useState<FarmView | null>(null);
  const [version, setVersion] = useState(0);
  const [message, setMessage] = useState(initialMessage);
  const [connectionStatus, setConnectionStatus] = useState<FarmConnectionStatus>(
    demoMode ? "synced" : "disconnected",
  );
  const [nowMs, setNowMs] = useState(Date.now());
  const versionRef = useRef(0);

  useLayoutEffect(() => {
    versionRef.current = version;
  }, [version]);

  const applyFarmSnapshot = useCallback<ApplyFarmSnapshot>((nextVersion, nextView, options = {}) => {
    if (!shouldApplyFarmSnapshot(versionRef.current, nextVersion, options)) {
      return false;
    }
    versionRef.current = nextVersion;
    // New/reset snapshots may arrive before the next UI clock tick, or
    // after timers were suspended. Readiness must use current time too.
    setNowMs(Date.now());
    setView(nextView);
    setVersion(nextVersion);
    return true;
  }, []);

  const load = useCallback(async () => {
    const [catalogResponse, farmResponse] = await Promise.all([client.catalog(), client.farm()]);
    setCatalog(catalogResponse);
    applyFarmSnapshot(farmResponse.version, farmResponse.view);
    setMessage(farmResponse.notice?.message ?? loadedMessage);
  }, [applyFarmSnapshot, client, loadedMessage]);

  useEffect(() => {
    if (!demoMode) {
      return;
    }
    load().catch((error) => setMessage(error.message));
  }, [demoMode, load]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
      if (!demoMode) {
        return;
      }
      client
        .farm()
        .then((farm) => {
          applyFarmSnapshot(farm.version, farm.view);
          if (farm.notice) {
            setMessage(farm.notice.message);
          }
        })
        .catch((error) => setMessage(error.message));
    }, clockIntervalMs);
    return () => window.clearInterval(timer);
  }, [applyFarmSnapshot, client, demoMode]);

  useEffect(() => {
    if (demoMode || !client.connect) {
      return;
    }
    return client.connect({
      status(status) {
        setConnectionStatus(status);
        setMessage(connectionStatusMessage(status));
      },
      catalog(nextCatalog) {
        setCatalog(nextCatalog);
      },
      farm(farm) {
        applyFarmSnapshot(farm.version, farm.view, { force: true });
        if (farm.notice) {
          setMessage(farm.notice.message);
        }
      },
      error(errorMessage) {
        setMessage(errorMessage);
      },
    });
  }, [applyFarmSnapshot, client, demoMode]);

  const send = useMemo(
    () =>
      createFarmCommandRunner({
        client,
        currentVersion: () => versionRef.current,
        applySnapshot: applyFarmSnapshot,
        notify: setMessage,
      }),
    [applyFarmSnapshot, client],
  );

  /**
   * Resets the authoritative farm. `onReset` runs in the same update batch as
   * the new snapshot so feature owners can clear their transient UI with it.
   */
  const reset = useCallback(async (onReset?: () => void) => {
    const response = await client.reset();
    applyFarmSnapshot(response.version, response.view, { force: true });
    onReset?.();
    setMessage(response.notice?.message ?? (demoMode ? "Demo farm reset" : "Farm reset"));
  }, [applyFarmSnapshot, client, demoMode]);

  return {
    demoMode,
    catalog,
    view,
    version,
    message,
    notify: setMessage,
    connectionStatus,
    nowMs,
    send,
    reset,
  };
}
