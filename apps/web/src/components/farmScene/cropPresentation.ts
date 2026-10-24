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
    // Each Wheat model is already a chunky 5-stalk golden sheaf, so a handful of
    // sheaves fill the plot; the toy look may spill past the Field Plot edge.
    positions: [
      [-0.13, -0.13, 0.10], [0.13, -0.12, 2.40], [0.00, 0.01, 4.10],
      [-0.12, 0.13, 1.15], [0.13, 0.13, 3.80],
    ],
    scale: {
      // Young Wheat must read as a leafy green patch, not as empty brown soil.
      early: 1.4,
      // Tall golden sheaves with oversized ears, clearly bigger than early Wheat.
      mature: 1.0,
      ready: 1.0,
    },
    model: { early: "wheat-early.glb", mature: "wheat-mature-straw.glb", ready: "wheat-mature-straw.glb" },
  },
  corn: {
    // Few, oversized lime-green plants so Corn reads differently from Wheat at a glance.
    positions: [
      [-0.12, -0.11, 0.40], [0.13, -0.06, 2.10], [-0.02, 0.14, 4.30],
    ],
    scale: { early: 1.2, mature: 1.15, ready: 1.15 },
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
