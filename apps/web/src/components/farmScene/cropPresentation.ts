import type { CropStage, GeneratedCrop } from "@my-farm/game-model";

// Bounded, authored placement of a crop patch inside one Field Plot: [x, z, yaw].
// No runtime scattering, seeds, physics, or crop growth state.
export type CropLayout = {
  positions: ReadonlyArray<readonly [number, number, number]>;
  scale: Record<CropStage, number>;
  /** Packaged asset-tooling stage file used for each authoritative stage. */
  model: Record<CropStage, string>;
};

export const CROP_LAYOUTS: Record<GeneratedCrop, CropLayout> = {
  wheat: {
    // A thick patch of thin stalks.
    positions: [
      [-0.20, -0.21, 0.10], [-0.06, -0.23, 2.40], [0.08, -0.22, 1.15], [0.21, -0.18, 3.80],
      [-0.21, -0.07, 2.30], [-0.06, -0.07, 0.80], [0.09, -0.06, 4.10], [0.21, -0.03, 1.45],
      [-0.21, 0.08, 3.65], [-0.06, 0.09, 1.90], [0.08, 0.09, 0.30], [0.21, 0.11, 2.70],
      [-0.20, 0.22, 0.75], [-0.06, 0.22, 3.10], [0.09, 0.21, 2.20], [0.21, 0.21, 5.20],
    ],
    scale: {
      // Young Wheat must read as a leafy green patch, not as empty brown soil.
      early: 1.9,
      // A recognizably taller, golden head-bearing patch at the overview zoom.
      mature: 1.3,
      ready: 1.3,
    },
    model: { early: "wheat-early.glb", mature: "wheat-mature-straw.glb", ready: "wheat-mature-straw.glb" },
  },
  corn: {
    // Few, oversized, chunky plants so Corn reads differently from Wheat at a glance.
    positions: [
      [-0.19, -0.19, 0.40], [0.19, -0.18, 2.10], [0.00, 0.01, 4.30],
      [-0.18, 0.19, 1.30], [0.19, 0.19, 5.60],
    ],
    scale: { early: 1.4, mature: 1.1, ready: 1.1 },
    model: { early: "corn-early.glb", mature: "corn-mature-straw.glb", ready: "corn-mature-straw.glb" },
  },
};

export function cropWindRotation(
  elapsedSeconds: number,
  plantIndex: number,
  windPhase: number,
  reducedMotion: boolean,
  paused: boolean,
): readonly [number, number] {
  if (reducedMotion || paused) return [0, 0];
  const phase = windPhase + plantIndex * 0.63;
  // Subtle pitch/roll around the base, explicitly cosmetic; never affects Farm state.
  return [
    0.012 * Math.sin(elapsedSeconds * 0.77 + phase * 0.81),
    0.026 * Math.sin(elapsedSeconds * 1.06 + phase),
  ];
}
