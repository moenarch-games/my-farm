import { currentResidentScenePose, residentTaskStatus } from "@my-farm/game-model/residentTasks";
import { type CatalogDocument, type FarmResident, type FarmView } from "@my-farm/contracts";
import { sceneStateLabel } from "./residentTaskFormat";

export function ResidentSelector({
  catalog,
  view,
  nowMs,
  onSelectResident,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  nowMs: number;
  onSelectResident: (residentId: string) => void;
}) {
  const residents = view.residents.slice(0, 2);

  return (
    <section className="panel-section resident-selector" aria-label="Farm Residents">
      <h2>Farm Residents</h2>
      <div className="resident-selector__list">
        {residents.map((resident) => (
          <ResidentCard
            key={resident.id}
            catalog={catalog}
            view={view}
            resident={resident}
            selected={resident.id === view.selected_resident_id}
            nowMs={nowMs}
            onSelectResident={onSelectResident}
          />
        ))}
      </div>
    </section>
  );
}

export function CompactResidentSelector({
  catalog,
  view,
  nowMs,
  onSelectResident,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  nowMs: number;
  onSelectResident: (residentId: string) => void;
}) {
  const residents = view.residents.slice(0, 2);

  return (
    <section className="resident-compact-selector" aria-label="Farm Residents">
      {residents.map((resident) => {
        const selected = resident.id === view.selected_resident_id;
        const status = residentTaskStatus(catalog, view, resident.id, nowMs);
        const pose = currentResidentScenePose(view, resident.id, nowMs);
        return (
          <button
            key={resident.id}
            type="button"
            className={
              selected
                ? "resident-compact-selector__button resident-compact-selector__button--selected"
                : "resident-compact-selector__button"
            }
            aria-pressed={selected}
            onClick={() => void onSelectResident(resident.id)}
          >
            <span className="resident-compact-selector__name">{resident.display_name}</span>
            <span className="resident-compact-selector__meta">
              <span>{selected ? "Selected" : sceneStateLabel(pose.state)}</span>
              <strong>{status.queuedCount}</strong>
            </span>
            {status.currentTask ? (
              <progress value={status.progress} max={1} aria-label={`${resident.display_name} task progress`} />
            ) : null}
          </button>
        );
      })}
    </section>
  );
}

export function ResidentCard({
  catalog,
  view,
  resident,
  selected,
  nowMs,
  onSelectResident,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  resident: FarmResident;
  selected: boolean;
  nowMs: number;
  onSelectResident: (residentId: string) => void;
}) {
  const status = residentTaskStatus(catalog, view, resident.id, nowMs);
  const pose = currentResidentScenePose(view, resident.id, nowMs);

  const selectResident = async () => {
    await onSelectResident(resident.id);
  };

  return (
    <article className={selected ? "resident-picker-row resident-picker-row--selected" : "resident-picker-row"}>
      <button
        type="button"
        className="resident-picker-row__button"
        aria-pressed={selected}
        onClick={() => void selectResident()}
      >
        <span className="resident-picker-row__name">{resident.display_name}</span>
        <span className="resident-picker-row__meta">
          <span>{selected ? "Selected" : sceneStateLabel(pose.state)}</span>
          <span className="resident-picker-row__badge">{status.queuedCount}</span>
        </span>
        {status.currentTask ? (
          <progress value={status.progress} max={1} aria-label={`${resident.display_name} task progress`} />
        ) : null}
      </button>
    </article>
  );
}
