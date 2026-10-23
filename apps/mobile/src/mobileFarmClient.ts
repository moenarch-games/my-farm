import { createHttpFarmClient, websocketUrl, type FarmClient } from "@my-farm/game-client";
import { assertAllowedServerUrl } from "./serverUrlPolicy";

export function createMobileFarmClient(baseUrl: string): FarmClient {
  assertAllowedServerUrl(baseUrl);
  return createHttpFarmClient(baseUrl, websocketUrl(baseUrl), {
    now: Date.now,
    randomUUID: randomRequestId,
    setTimeout,
    clearTimeout,
    WebSocket: globalThis.WebSocket,
  });
}

function randomRequestId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
