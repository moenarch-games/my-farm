import { structureLabel } from "@my-farm/game-model/selectors";
import { type CatalogDocument, type FarmView, type StructureKind } from "@my-farm/contracts";

type BuildableStructureKind = Exclude<StructureKind, "silo" | "barn">;

export type BuildableKind = "field_plot" | BuildableStructureKind;

const fieldPlotBuildCost = 12;

export const buildKinds: BuildableKind[] = [
  "field_plot",
  "feed_mill",
  "chicken_coop",
  "delivery_board",
  "farm_shop",
  "cow_pasture",
  "tool_shed",
];

export type BuildPlacementState = {
  kind: BuildableKind;
} | null;

type StructureBuildCardMeta = {
  kind: BuildableKind;
  role: string;
  accentClass: string;
};

const structureBuildCardMetas: Record<BuildableKind, StructureBuildCardMeta> = {
  field_plot: {
    kind: "field_plot",
    role: "Adds another field plot for crop growing.",
    accentClass: "field-plot",
  },
  feed_mill: {
    kind: "feed_mill",
    role: "Mills crops into animal feed.",
    accentClass: "feed-mill",
  },
  chicken_coop: {
    kind: "chicken_coop",
    role: "Houses chickens that produce eggs.",
    accentClass: "chicken-coop",
  },
  delivery_board: {
    kind: "delivery_board",
    role: "Unlocks delivery orders for coins and XP.",
    accentClass: "delivery-board",
  },
  farm_shop: {
    kind: "farm_shop",
    role: "Stocks roadside goods for passing customers.",
    accentClass: "farm-shop",
  },
  cow_pasture: {
    kind: "cow_pasture",
    role: "Houses cows that produce milk.",
    accentClass: "cow-pasture",
  },
  tool_shed: {
    kind: "tool_shed",
    role: "Stores tools for resident work.",
    accentClass: "tool-shed",
  },
};

export function isDemoBuildKind(kind: BuildableKind): boolean {
  return kind === "field_plot";
}

export type StructureBuildCardState = StructureBuildCardMeta & {
  label: string;
  cost: number;
  status: string;
  reason?: string;
  canPlace: boolean;
  selected: boolean;
  placing: boolean;
};

export function buildStructureCardState(
  catalog: CatalogDocument,
  view: FarmView,
  kind: BuildableKind,
  built: Set<StructureKind>,
  selectedKind: BuildableKind | null,
  buildPlacement: BuildPlacementState,
): StructureBuildCardState {
  const unlockLevel = unlockLevelForBuildKind(catalog, kind);
  const cost = buildCostForBuildKind(catalog, kind);
  const isBuilt = kind !== "field_plot" && built.has(kind);
  const locked = view.level < unlockLevel;
  const unaffordable = view.coins < cost;
  const placing = buildPlacement?.kind === kind;
  const reason = isBuilt
    ? "Already built"
    : locked
      ? `Unlocks at level ${unlockLevel}`
      : unaffordable
        ? `Need ${cost - view.coins} coins`
        : undefined;
  const meta = structureBuildCardMetas[kind];

  return {
    ...meta,
    label: buildKindLabel(kind),
    cost,
    status: isBuilt ? "Built" : locked ? `Level ${unlockLevel}` : unaffordable ? "Need coins" : "Ready",
    reason,
    canPlace: !isBuilt && !locked && !unaffordable,
    selected: selectedKind === kind,
    placing,
  };
}

export function structureInitials(label: string): string {
  return label
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2);
}

export function buildKindLabel(kind: BuildableKind): string {
  return kind === "field_plot" ? "Field Plot" : structureLabel(kind);
}

function unlockLevelForBuildKind(catalog: CatalogDocument, kind: BuildableKind): number {
  if (kind === "field_plot") {
    return 1;
  }
  if (kind === "feed_mill") {
    return catalog.machines.find((machine) => machine.kind === kind)?.unlock_level ?? 1;
  }
  if (kind === "delivery_board") {
    return 4;
  }
  if (kind === "farm_shop") {
    return 2;
  }
  if (kind === "tool_shed") {
    return 3;
  }
  const shelterKind = kind === "chicken_coop" ? "chicken_coop" : "cow_pasture";
  return catalog.shelters.find((shelter) => shelter.kind === shelterKind)?.unlock_level ?? 1;
}

function buildCostForBuildKind(catalog: CatalogDocument, kind: BuildableKind): number {
  if (kind === "field_plot") {
    return fieldPlotBuildCost;
  }
  if (kind === "feed_mill") {
    return catalog.machines.find((machine) => machine.kind === kind)?.build_cost ?? 0;
  }
  if (kind === "delivery_board") {
    return 20;
  }
  if (kind === "farm_shop") {
    return 25;
  }
  if (kind === "tool_shed") {
    return 45;
  }
  const shelterKind = kind === "chicken_coop" ? "chicken_coop" : "cow_pasture";
  return catalog.shelters.find((shelter) => shelter.kind === shelterKind)?.build_cost ?? 0;
}
