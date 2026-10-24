import { useMemo } from "react";
import { builtStructureKinds } from "@my-farm/game-model/selectors";
import { type CatalogDocument, type FarmView } from "@my-farm/contracts";
import { type BuildPlacementState, type BuildableKind, type StructureBuildCardState, buildKinds, buildStructureCardState, isDemoBuildKind, structureInitials } from "./buildKinds";

export function BuildTray({
  catalog,
  view,
  selectedKind,
  buildPlacement,
  demoMode,
  onInspectKind,
  onSelectKind,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  selectedKind: BuildableKind | null;
  buildPlacement: BuildPlacementState;
  demoMode: boolean;
  onInspectKind: (kind: BuildableKind) => void;
  onSelectKind: (kind: BuildableKind, canPlace: boolean) => void;
}) {
  const built = useMemo(() => builtStructureKinds(view), [view]);
  const visibleBuildKinds = demoMode ? buildKinds.filter(isDemoBuildKind) : buildKinds;
  const cardStates = visibleBuildKinds.map((kind) =>
    buildStructureCardState(catalog, view, kind, built, selectedKind, buildPlacement),
  );
  const detail =
    cardStates.find((state) => state.kind === (selectedKind ?? visibleBuildKinds[0])) ?? cardStates[0];

  return (
    <section className="build-dock" aria-label="Structure build menu">
      <div
        className={`build-detail-strip build-detail-strip--${detail.accentClass}`}
        data-testid="build-detail-strip"
      >
        <div className="build-detail-strip__copy">
          <strong>{detail.label}</strong>
          <span>{detail.role}</span>
        </div>
        <div className="build-detail-strip__facts">
          <span>{detail.cost} coins</span>
          <span>{detail.placing ? `Place ${detail.label} - Choose a tile` : detail.reason ?? "Click to place"}</span>
        </div>
      </div>
      <nav className="build-tray" aria-label="Structures">
        {cardStates.map((state) => (
          <StructureBuildCard
            key={state.kind}
            state={state}
            onInspect={() => onInspectKind(state.kind)}
            onSelect={() => onSelectKind(state.kind, state.canPlace)}
          />
        ))}
      </nav>
    </section>
  );
}

export function StructureBuildCard({
  state,
  onInspect,
  onSelect,
}: {
  state: StructureBuildCardState;
  onInspect: () => void;
  onSelect: () => void;
}) {
  return (
    <button
      className={`structure-build-card structure-build-card--${state.accentClass}${
        state.selected ? " structure-build-card--selected" : ""
      }${state.placing ? " structure-build-card--placing" : ""}`}
      type="button"
      aria-pressed={state.placing}
      data-status={state.status}
      onFocus={onInspect}
      onClick={onSelect}
    >
      <span className="structure-build-card__art" aria-hidden="true">
        {structureInitials(state.label)}
      </span>
      <span className="structure-build-card__body">
        <strong>{state.label}</strong>
        <span>{state.role}</span>
      </span>
      <span className="structure-build-card__footer">
        <span>{state.cost} coins</span>
        <span>{state.placing ? "Placing" : state.status}</span>
      </span>
    </button>
  );
}
