import { type CSSProperties } from "react";
import { type FarmConnectionStatus } from "../../api";
import { ResourceIcon } from "../../components/ResourceIcon";
import { type CatalogDocument, type FarmView } from "@my-farm/contracts";
import { hudNoticeMessage, levelProgress } from "./hudStatus";

export function TopBar({
  catalog,
  view,
  message,
  connectionStatus,
  onOpenMenu,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  message: string;
  connectionStatus: FarmConnectionStatus;
  onOpenMenu: () => void;
}) {
  const notice = hudNoticeMessage(message);
  return (
    <header className="top-bar">
      <strong className="top-bar__brand">My Farm</strong>
      <LevelProgressBadge catalog={catalog} view={view} />
      <span className="hud-chip hud-chip--coins">
        <ResourceIcon type="coins" />
        <span>{view.coins} coins</span>
      </span>
      <StorageSummaryChip view={view} />
      <ConnectionStatus status={connectionStatus} />
      <HudNotice message={notice} />
      <button className="top-bar__menu-button" type="button" onClick={onOpenMenu}>
        Menu
      </button>
    </header>
  );
}

export function LevelProgressBadge({ catalog, view }: { catalog: CatalogDocument; view: FarmView }) {
  const progress = levelProgress(catalog, view);
  return (
    <span
      className="level-progress-badge"
      style={{ "--level-progress": `${progress.percent}%` } as CSSProperties}
      aria-label={progress.label}
      title={progress.label}
      data-testid="level-progress-badge"
    >
      <span>{view.level}</span>
    </span>
  );
}

export function StorageSummaryChip({ view }: { view: FarmView }) {
  const siloRatio = view.silo_capacity > 0 ? view.silo_used / view.silo_capacity : 1;
  const barnRatio = view.barn_capacity > 0 ? view.barn_used / view.barn_capacity : 1;
  const full = view.silo_used >= view.silo_capacity || view.barn_used >= view.barn_capacity;
  const warning = full || siloRatio >= 0.8 || barnRatio >= 0.8;
  const className = full
    ? "hud-chip storage-summary-chip storage-summary-chip--full"
    : warning
      ? "hud-chip storage-summary-chip storage-summary-chip--warning"
      : "hud-chip storage-summary-chip";

  return (
    <span
      className={className}
      aria-label={`Storage Silo ${view.silo_used} of ${view.silo_capacity}, Barn ${view.barn_used} of ${view.barn_capacity}`}
      data-testid="storage-summary-chip"
    >
      <span className="storage-summary-chip__item">
        <ResourceIcon type="silo" />
        <span className="storage-summary-chip__label">Silo</span>
        <span>{view.silo_used}/{view.silo_capacity}</span>
      </span>
      <span className="storage-summary-chip__item">
        <ResourceIcon type="barn" />
        <span className="storage-summary-chip__label">Barn</span>
        <span>{view.barn_used}/{view.barn_capacity}</span>
      </span>
    </span>
  );
}

export function HudNotice({ message }: { message: string | null }) {
  return (
    <small className={message ? "hud-notice" : "hud-notice hud-notice--empty"} aria-live="polite">
      {message ?? ""}
    </small>
  );
}

export function ConnectionStatus({ status }: { status: FarmConnectionStatus }) {
  const label =
    status === "synced"
      ? "Synced"
      : status === "reconnecting"
        ? "Reconnecting"
        : "Disconnected";

  return (
    <span className={`connection-status connection-status--${status}`} aria-label={`Connection ${label}`}>
      {label}
    </span>
  );
}

export function Metric({
  type,
  label,
}: {
  type: "coins" | "xp" | "level" | "silo" | "barn";
  label: string;
}) {
  return (
    <span className={`metric metric--${type}`}>
      <ResourceIcon type={type} />
      {label}
    </span>
  );
}
