// Plain-HTTP policy for Farm server URLs (#253). The release network config
// allows cleartext everywhere, so the app itself restricts `http://` to local
// and private-network hosts; public hosts must use https.

export const insecurePublicHostMessage =
  "Plain http:// is only allowed for local network servers (localhost, 10.x, 172.16-31.x, 192.168.x, 169.254.x, *.local). Use https:// for public hosts.";

export function isLocalNetworkHost(hostname: string): boolean {
  const host = hostname.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/\.$/, "");
  if (!host) {
    return false;
  }
  if (host === "localhost" || host.endsWith(".local")) {
    return true;
  }
  const ipv4 = parseIpv4(host);
  if (ipv4) {
    return isPrivateIpv4(ipv4);
  }
  if (host.includes(":")) {
    return isLoopbackIpv6(host);
  }
  return false;
}

export function assertAllowedServerUrl(url: string): void {
  const parsed = new URL(url);
  if (parsed.protocol === "https:") {
    return;
  }
  if (parsed.protocol !== "http:") {
    throw new Error(`Unsupported server URL protocol ${parsed.protocol}`);
  }
  if (!isLocalNetworkHost(parsed.hostname)) {
    throw new Error(insecurePublicHostMessage);
  }
}

function parseIpv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4 || !parts.every((part) => /^\d{1,3}$/.test(part))) {
    return null;
  }
  const octets = parts.map(Number);
  return octets.every((octet) => octet <= 255) ? octets : null;
}

function isPrivateIpv4([a, b]: number[]): boolean {
  return (
    a === 127 || // loopback 127/8
    a === 10 || // 10/8, includes the Android emulator host 10.0.2.2
    (a === 172 && b >= 16 && b <= 31) || // 172.16/12
    (a === 192 && b === 168) || // 192.168/16
    (a === 169 && b === 254) // link-local 169.254/16
  );
}

function isLoopbackIpv6(host: string): boolean {
  if (host === "::1") {
    return true;
  }
  // IPv4-mapped loopback/private addresses, e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1.
  const mapped = /^::ffff:(.+)$/.exec(host);
  if (!mapped) {
    return false;
  }
  const dotted = parseIpv4(mapped[1]);
  if (dotted) {
    return isPrivateIpv4(dotted);
  }
  const hex = /^([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(mapped[1]);
  if (!hex) {
    return false;
  }
  const high = parseInt(hex[1], 16);
  return isPrivateIpv4([high >> 8, high & 0xff]);
}
