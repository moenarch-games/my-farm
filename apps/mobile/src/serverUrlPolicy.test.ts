import { describe, expect, test } from "bun:test";
import { assertAllowedServerUrl, isLocalNetworkHost } from "./serverUrlPolicy";

describe("isLocalNetworkHost", () => {
  test.each([
    "localhost",
    "LOCALHOST",
    "127.0.0.1",
    "127.255.255.254",
    "::1",
    "[::1]",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "::ffff:c0a8:10a",
    "10.0.0.1",
    "10.0.2.2",
    "10.255.255.255",
    "172.16.0.1",
    "172.31.255.255",
    "192.168.1.10",
    "169.254.10.20",
    "castle.local",
    "castle.local.",
  ])("allows %s", (host) => {
    expect(isLocalNetworkHost(host)).toBe(true);
  });

  test.each([
    "",
    "example.com",
    "local",
    "farm.localdomain",
    "local.example.com",
    "8.8.8.8",
    "11.0.0.1",
    "172.15.255.255",
    "172.32.0.1",
    "192.169.1.1",
    "169.253.1.1",
    "1.10.0.1",
    "10.0.0.256",
    "10.0.0",
    "10.0.0.1.example.com",
    "::2",
    "::",
    "2001:db8::1",
    "fe80::1",
    "::ffff:8.8.8.8",
    "::ffff:808:808",
  ])("rejects %s", (host) => {
    expect(isLocalNetworkHost(host)).toBe(false);
  });
});

describe("assertAllowedServerUrl", () => {
  test("allows https anywhere and http only to local hosts", () => {
    expect(() => assertAllowedServerUrl("https://farm.example.com")).not.toThrow();
    expect(() => assertAllowedServerUrl("http://10.0.2.2:8081")).not.toThrow();
    expect(() => assertAllowedServerUrl("http://[::1]:8081")).not.toThrow();
    expect(() => assertAllowedServerUrl("http://farm.example.com")).toThrow("Use https:// for public hosts");
    expect(() => assertAllowedServerUrl("http://172.32.0.1:8081")).toThrow("Use https:// for public hosts");
  });

  test("rejects other protocols", () => {
    expect(() => assertAllowedServerUrl("ftp://10.0.0.1")).toThrow("Unsupported server URL protocol");
  });
});
