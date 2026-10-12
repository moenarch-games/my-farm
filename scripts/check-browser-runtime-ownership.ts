import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const cli = require.resolve("@playwright/test/cli");
const titles = [
  "published asset-tooling Wheat and soil are actual pinned web resources",
  "Wheat appearance follows planted Crop state through progress, harvest and reload",
];

type DiscoveredTest = {
  expectedStatus: string;
  projectName: string;
  annotations: Array<{ type: string }>;
};
type DiscoveredSpec = { title: string; file: string; tests: DiscoveredTest[] };
type DiscoveredSuite = { specs?: DiscoveredSpec[]; suites?: DiscoveredSuite[] };
type DiscoveryReport = { errors: unknown[]; suites: DiscoveredSuite[] };

function discover(config: string): DiscoveredSpec[] {
  const report = JSON.parse(execFileSync(process.execPath, [cli, "test", "--config", config, "--list", "--reporter=json"], {
    cwd: root,
    encoding: "utf8",
    timeout: 30_000,
  })) as DiscoveryReport;
  assert.deepEqual(report.errors, [], `${config}: discovery must succeed`);
  function specs(suites: DiscoveredSuite[]): DiscoveredSpec[] {
    return suites.flatMap((suite) => [...(suite.specs ?? []), ...specs(suite.suites ?? [])]);
  }
  return specs(report.suites);
}

const pages = discover("apps/web/playwright.pages-demo.config.ts");
for (const title of titles) {
  const matches = pages.filter((spec) => spec.title === title);
  assert.equal(matches.length, 1, `Pages must discover exactly one ${title}`);
  assert.equal(matches[0].file, "wheat-art.spec.ts");
  assert.ok(matches[0].tests.length > 0);
  for (const test of matches[0].tests) {
    assert.equal(test.expectedStatus, "passed", `${title}: required behavioral coverage cannot be skipped`);
    assert.ok(!test.annotations.some((annotation) => ["skip", "fixme"].includes(annotation.type)));
  }
}
const server = discover("apps/web/playwright.config.ts");
assert.equal(server.filter((spec) => spec.file === "wheat-art.spec.ts").length, 0,
  "Browser-local WASM Wheat fixtures must not be dispatched to the server runtime");
const shell = server.filter((spec) => spec.title === "renders the playable farm shell");
assert.equal(shell.length, 1);
assert.deepEqual(shell[0].tests.map((test) => test.projectName).sort(), ["desktop", "mobile"]);
assert.ok(shell[0].tests.every((test) => test.expectedStatus === "passed"));
console.log("Actual Playwright discovery preserves mandatory Pages Wheat and desktop/phone server shell coverage.");
