import type { FarmView } from "@my-farm/contracts";
import type { Selection } from "@my-farm/game-model/selectors";
import { wikiPageHref } from "../scenarioRoutes";

export function FarmGuidance({ view, deposited, residentSelected, onDismiss, onInspect }: {
  view: FarmView;
  deposited: boolean;
  residentSelected: boolean;
  onDismiss: () => void;
  onInspect: (selection: Selection) => void;
}) {
  const work = Object.values(view.resident_work).find((resident) => resident?.block)
    ?? Object.values(view.resident_work).find((resident) => resident?.current_task);
  const planted = view.field_plots.find((plot) => plot.crop);
  const ready = view.field_plots.find((plot) => plot.crop && plot.crop.ready_at_ms <= view.last_update_ms);
  const harvest = Object.values(view.resident_work).find((resident) => resident?.queue.some(
    (task) => task.steps.some((step) => step.activity === "harvesting"
      || (step.activity === "depositing_inventory" && step.target?.kind === "silo")),
  ));
  let title = "Select a Resident";
  let instruction = "Choose a Resident in the Farm, then open Seed and plant stored Wheat in an empty Field Plot.";
  if (work?.block) {
    title = "Work needs attention";
    instruction = `${work.block.message} Select ${work.display_name} to inspect the Task and carried inventory.`;
  } else if (deposited) {
    title = "Harvest deposited";
    instruction = "Your Crop is stored in the Silo. Select the Farmhouse to prepare the Oven and make Bread.";
  } else if (harvest) {
    title = "Follow the harvest to the Silo";
    instruction = `${harvest.display_name} must finish harvesting and deposit the carried Crop. Queued work is not stored output; Tools return afterward.`;
  } else if (ready) {
    title = "Harvest the ready Crop";
    instruction = "Choose Harvest and the ready Field Plot. Your Resident will carry the output to the Silo before returning Tools.";
  } else if (planted) {
    title = "Watch your Crop grow";
    instruction = "Select the planted Field Plot to inspect progress. Wait for Ready, then use Harvest; the Silo stores the finished Crop.";
  } else if (work?.current_task?.steps.some((step) => step.activity === "planting")) {
    title = "Your Resident is preparing the Field Plot";
    instruction = "Planting uses a stored Crop. The Resident collects it and Tools, walks to the Field Plot, plants, and returns Tools.";
  } else if (residentSelected) {
    title = "Plant a stored Crop";
    instruction = "Open Seed, choose Wheat, and select an empty Field Plot. Planting consumes stored Crop; reserved stock is already committed.";
  }
  let target: Selection = { type: "resident", id: view.selected_resident_id };
  let targetLabel = "Show Resident";
  if (work?.block) {
    target = { type: "resident", id: work.resident_id };
  } else if (deposited) {
    target = { type: "farmhouse" };
    targetLabel = "Show Farmhouse";
  } else if (harvest) {
    target = { type: "silo" };
    targetLabel = "Show Silo";
  } else if (ready) {
    target = { type: "plot", id: ready.id };
    targetLabel = "Inspect Field Plot";
  } else if (planted) {
    target = { type: "plot", id: planted.id };
    targetLabel = "Inspect Field Plot";
  } else if (residentSelected) {
    const empty = view.field_plots.find((plot) => !plot.crop);
    if (empty) { target = { type: "plot", id: empty.id }; targetLabel = "Show Field Plot"; }
  }
  return (
    <section className="farm-guidance" role="region" aria-label="Farm guidance">
      <div className="farm-guidance__copy" aria-live="polite">
        <strong>{title}</strong>
        <p>{instruction}</p>
      </div>
      <div className="farm-guidance__actions">
        <button type="button" onClick={() => onInspect(target)}>{targetLabel}</button>
        <a href={wikiPageHref()} target="_blank" rel="noreferrer">Wiki</a>
        <button type="button" onClick={onDismiss} aria-label="Dismiss guidance">Dismiss</button>
      </div>
    </section>
  );
}
