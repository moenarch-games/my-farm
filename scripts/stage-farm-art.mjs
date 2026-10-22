import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const config = JSON.parse(await readFile(path.join(root, "scripts/farm-art-source.json"), "utf8"));
const upstream = path.resolve(process.argv[2] ?? path.join(root, ".artifacts/asset-tooling-source"));
const selected = [];
for (const [crop, stages] of Object.entries(config.crops)) {
  const packageDir = path.join(upstream, `.artifacts/${crop}/package`);
  const manifest = JSON.parse(await readFile(path.join(packageDir, "manifest.json"), "utf8"));
  assert.equal(manifest.profile, config.profile);
  assert.equal(manifest.schemaVersion, 1);
  for (const stage of stages) {
    for (const [kind, extension] of [["mesh", "glb"], ["icon", "png"]]) {
      const entry = manifest.assets.find((asset) => asset.key === `${crop}.${kind}` && asset.variant === stage);
      assert.ok(entry, `Missing packaged ${crop} ${kind} variant ${stage}`);
      const relative = entry.path;
      assert.match(relative, /^assets\/[0-9a-f]{64}\.(glb|png)$/);
      const bytes = await readFile(path.join(packageDir, relative));
      assert.equal(bytes.length, entry.source.byteLength, relative);
      assert.equal(createHash("sha256").update(bytes).digest("hex"), entry.source.sha256, relative);
      assert.equal(relative.split(".").at(-1), extension);
      selected.push({ name: `${crop}-${stage}.${extension}`, bytes, source: entry.source });
    }
  }
}
for (const channel of ["color", "normal", "roughness"]) {
  const name = `${config.soilPreset}-${channel}.png`;
  const bytes = await readFile(path.join(upstream, ".artifacts/tilled-soil", name));
  assert.deepEqual(bytes.subarray(0, 8), Buffer.from("89504e470d0a1a0a", "hex"), name);
  selected.push({ name, bytes, source: { kind: "image", mediaType: "image/png" } });
}
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const storeObject = (sha) => readFile(path.join(upstream, ".asset-tooling/objects/v1/sha256", sha.slice(0, 2), sha));
for (const [kitName, intensity] of Object.entries(config.feedbackKits ?? {})) {
  const kitDir = path.join(upstream, ".artifacts/feedback-kits", kitName);
  const kit = JSON.parse(await readFile(path.join(kitDir, "kit.json"), "utf8"));
  assert.equal(kit.kit, kitName);
  assert.equal(kit.schemaVersion, 1);
  assert.equal(kit.presentation, "cosmetic-only");
  const variant = kit.variants[intensity];
  assert.ok(variant, `Missing ${kitName} ${intensity} variant`);
  const wav = await readFile(path.join(kitDir, `${intensity}.wav`));
  assert.equal(sha256(wav), variant.audio.cue.sha256, `${kitName} ${intensity}.wav`);
  const atlasBytes = await storeObject(variant.visual.atlas.sha256);
  assert.equal(sha256(atlasBytes), variant.visual.atlas.sha256, `${kitName} atlas`);
  const atlas = JSON.parse(atlasBytes.toString("utf8"));
  assert.equal(atlas.coordinates, "top-left-pixels");
  const base = `${kitName}.${intensity}`;
  // The page needs only frame geometry and timing; keep the kit receipt hashes for audit.
  const sequence = {
    schemaVersion: 1,
    kit: kitName,
    intensity,
    kitSha256: sha256(await readFile(path.join(kitDir, "kit.json"))),
    atlasSha256: variant.visual.atlas.sha256,
    concurrency: kit.concurrency,
    endMs: variant.endMs,
    audio: { file: `${base}.wav`, onsetMs: variant.audio.onsetMs, durationMs: variant.audio.durationMs },
    visual: {
      file: `${base}.atlas.png`,
      reducedMotionFile: `${base}.reduced-motion.png`,
      onsetMs: variant.visual.onsetMs,
      width: atlas.width,
      height: atlas.height,
      frames: atlas.sprites.map((sprite) => ({
        timeMs: sprite.frame.timeMs,
        durationMs: sprite.frame.durationMs,
        empty: sprite.empty,
        rect: sprite.rect,
        trimOffset: sprite.trimOffset,
        sourceSize: sprite.sourceSize,
      })),
    },
  };
  selected.push({ name: `${base}.wav`, bytes: wav, source: variant.audio.cue });
  for (const name of ["atlas", "reduced-motion"]) {
    const bytes = await readFile(path.join(kitDir, `${intensity}.${name}.png`));
    selected.push({ name: `${base}.${name}.png`, bytes, source: { kind: "image", mediaType: "image/png" } });
  }
  selected.push({
    name: `${base}.json`,
    bytes: Buffer.from(JSON.stringify(sequence, null, 2) + "\n"),
    source: { kind: "feedback-sequence", mediaType: "application/json", atlasSha256: variant.visual.atlas.sha256 },
  });
}
// Publish only after validating the complete selected closure.
for (const asset of selected) {
  if (asset.name.endsWith(".glb")) {
    assert.equal(asset.bytes.toString("ascii", 0, 4), "glTF", asset.name);
  } else if (asset.name.endsWith(".wav")) {
    assert.equal(asset.bytes.toString("ascii", 0, 4), "RIFF", asset.name);
  } else if (asset.name.endsWith(".json")) {
    JSON.parse(asset.bytes.toString("utf8"));
  } else {
    assert.deepEqual(asset.bytes.subarray(0, 8), Buffer.from("89504e470d0a1a0a", "hex"), asset.name);
  }
}
const out = path.join(root, "apps/web/public/farm-art");
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
const files = {};
for (const asset of selected) {
  await writeFile(path.join(out, asset.name), asset.bytes);
  files[asset.name] = {
    sha256: createHash("sha256").update(asset.bytes).digest("hex"),
    byteLength: asset.bytes.length,
    source: asset.source,
  };
}
await writeFile(path.join(out, "manifest.json"), JSON.stringify({
  schemaVersion: 1,
  assetToolingCommit: config.assetToolingCommit,
  soilPreset: config.soilPreset,
  profile: config.profile,
  files,
}, null, 2) + "\n");
console.log(`Staged ${selected.length} verified asset-tooling outputs from ${config.assetToolingCommit}`);
