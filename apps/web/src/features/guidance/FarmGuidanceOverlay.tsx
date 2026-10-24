import type { FarmView } from "@my-farm/contracts";
import type { Selection } from "@my-farm/game-model/selectors";
import { FarmGuidance } from "../../components/FarmGuidance";
import type { FarmGuidanceController } from "./useFarmGuidance";

/** Guidance card, or its resume button once dismissed. */
export function FarmGuidanceOverlay({
  controller,
  view,
  residentSelected,
  onInspect,
}: {
  controller: FarmGuidanceController;
  view: FarmView;
  residentSelected: boolean;
  onInspect: (selection: Selection) => void;
}) {
  const { enabled, guidance, setDismissed } = controller;
  if (!enabled) {
    return null;
  }
  if (guidance.dismissed) {
    return (
      <button className="farm-guidance-resume" type="button" onClick={() => setDismissed(false)}>Resume guidance</button>
    );
  }
  return (
    <FarmGuidance view={view} deposited={guidance.deposited} residentSelected={residentSelected}
      onDismiss={() => setDismissed(true)} onInspect={onInspect} />
  );
}
