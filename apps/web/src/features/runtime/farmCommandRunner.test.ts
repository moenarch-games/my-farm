/// <reference types="bun-types/test" />

import { describe, expect, test } from "bun:test";
import type { CommandRequest, CommandResponse, FarmView } from "@my-farm/contracts";
import {
  connectionStatusMessage,
  createFarmCommandRunner,
  shouldApplyFarmSnapshot,
} from "./farmCommandRunner";

const view = (coins: number) => ({ coins }) as unknown as FarmView;

function response(overrides: Partial<CommandResponse>): CommandResponse {
  return { accepted: true, error: null, version: 1, view: view(0), notice: null, ...overrides } as CommandResponse;
}

function harness(responses: (CommandResponse | Error)[], startVersion = 3) {
  const requests: CommandRequest[] = [];
  const snapshots: [number, FarmView][] = [];
  const messages: string[] = [];
  let version = startVersion;
  const send = createFarmCommandRunner({
    client: {
      async command(request) {
        requests.push(request);
        const next = responses.shift();
        if (!next || next instanceof Error) {
          throw next ?? new Error("no response");
        }
        return next;
      },
    },
    currentVersion: () => version,
    applySnapshot: (nextVersion, nextView) => {
      snapshots.push([nextVersion, nextView]);
      version = nextVersion;
      return true;
    },
    notify: (message) => messages.push(message),
  });
  return { send, requests, snapshots, messages };
}

describe("farm command runner", () => {
  test("sends at the current version and applies the accepted snapshot", async () => {
    const { send, requests, snapshots, messages } = harness([response({ version: 4, view: view(9) })]);
    const result = await send({ type: "select_resident", resident_id: "woman" });

    expect(result).toEqual({ accepted: true, error: null });
    expect(requests).toEqual([{ expected_version: 3, command: { type: "select_resident", resident_id: "woman" } }]);
    expect(snapshots).toEqual([[4, view(9)]]);
    expect(messages).toEqual(["Command accepted"]);
  });

  test("adopts the server snapshot and retries once after a version mismatch", async () => {
    const { send, requests, snapshots, messages } = harness([
      response({ accepted: false, error: "version mismatch: expected 3, current 7", version: 7, view: view(1) }),
      response({ version: 8, view: view(2), notice: { message: "Bought Feed Mill" } as CommandResponse["notice"] }),
    ]);
    const result = await send({ type: "buy_field_plot", tile: { x: 1, y: 2 } });

    expect(result.accepted).toBe(true);
    expect(requests.map((request) => request.expected_version)).toEqual([3, 7]);
    expect(snapshots.map(([version]) => version)).toEqual([7, 8]);
    expect(messages).toEqual(["Bought Feed Mill"]);
  });

  test("reports rejections and transport failures without throwing", async () => {
    const rejected = harness([response({ accepted: false, error: "Not enough coins", version: 3 })]);
    expect(await rejected.send({ type: "buy_field_plot", tile: { x: 0, y: 0 } })).toEqual({
      accepted: false,
      error: "Not enough coins",
    });
    expect(rejected.messages).toEqual(["Not enough coins"]);

    const failed = harness([new Error("socket closed")]);
    expect(await failed.send({ type: "buy_field_plot", tile: { x: 0, y: 0 } })).toEqual({
      accepted: false,
      error: "socket closed",
    });
    expect(failed.snapshots).toEqual([]);
    expect(failed.messages).toEqual(["socket closed"]);
  });

  test("stale snapshots are ignored unless forced", () => {
    expect(shouldApplyFarmSnapshot(5, 4)).toBe(false);
    expect(shouldApplyFarmSnapshot(5, 5)).toBe(true);
    expect(shouldApplyFarmSnapshot(5, 2, { force: true })).toBe(true);
  });

  test("connection status maps to the HUD message", () => {
    expect(connectionStatusMessage("disconnected")).toBe("Local server disconnected");
    expect(connectionStatusMessage("reconnecting")).toBe("Reconnecting to local server...");
    expect(connectionStatusMessage("synced")).toBe("Local farm synced");
  });
});
