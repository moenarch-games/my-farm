import type { FarmClient, FarmConnectionStatus } from "@my-farm/game-client";
import type { FarmCommand, FarmView } from "@my-farm/contracts";

export type CommandResult = { accepted: boolean; error: string | null };
export type SendCommand = (command: FarmCommand) => Promise<CommandResult>;

/** Applies an authoritative snapshot; returns false when it was stale and ignored. */
export type ApplyFarmSnapshot = (
  version: number,
  view: FarmView,
  options?: { force?: boolean },
) => boolean;

/**
 * Snapshots are only accepted when they are not older than the newest one seen,
 * unless forced (server pushes and resets are authoritative replacements).
 */
export function shouldApplyFarmSnapshot(
  currentVersion: number,
  nextVersion: number,
  options: { force?: boolean } = {},
) {
  return options.force === true || nextVersion >= currentVersion;
}

export function connectionStatusMessage(status: FarmConnectionStatus) {
  if (status === "disconnected") {
    return "Local server disconnected";
  }
  if (status === "reconnecting") {
    return "Reconnecting to local server...";
  }
  return "Local farm synced";
}

/**
 * Sends one command through the authoritative command boundary. A version
 * mismatch adopts the returned snapshot and retries once at that version.
 */
export function createFarmCommandRunner({
  client,
  currentVersion,
  applySnapshot,
  notify,
}: {
  client: Pick<FarmClient, "command">;
  currentVersion: () => number;
  applySnapshot: ApplyFarmSnapshot;
  notify: (message: string) => void;
}): SendCommand {
  return async (command) => {
    try {
      let response = await client.command({ expected_version: currentVersion(), command });
      if (!response.accepted && response.error?.startsWith("version mismatch")) {
        applySnapshot(response.version, response.view);
        response = await client.command({ expected_version: response.version, command });
      }
      applySnapshot(response.version, response.view);
      notify(response.notice?.message ?? (response.accepted ? "Command accepted" : response.error ?? "Command rejected"));
      return { accepted: response.accepted, error: response.error };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Command failed";
      notify(errorMessage);
      return { accepted: false, error: errorMessage };
    }
  };
}
