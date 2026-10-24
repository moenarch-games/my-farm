import { type ActiveFieldTool } from "../components/InteractionToolSelector";
import { getBasicFarmScenario, type BasicFarmScenarioId } from "@my-farm/game-model/basicFarmScenarios";
import { type Selection } from "@my-farm/game-model/selectors";

type ScenarioSceneConfig = {
  selection: Selection;
  activeFieldTool: ActiveFieldTool;
};

export function scenarioSceneConfig(scenarioId: BasicFarmScenarioId): ScenarioSceneConfig {
  switch (scenarioId) {
    case "planting-wheat":
      return {
        selection: { type: "plot", id: "plot-1" },
        activeFieldTool: { type: "plant", cropId: "wheat" },
      };
    case "resident-work-queue":
      return { selection: { type: "resident", id: "woman" }, activeFieldTool: { type: "default" } };
    case "harvesting-ready-crops":
      return { selection: { type: "plot", id: "plot-1" }, activeFieldTool: { type: "harvest" } };
    case "unlocking-corn-and-oven":
    case "making-bread":
      return { selection: { type: "farmhouse" }, activeFieldTool: { type: "default" } };
    case "blocked-work-and-storage":
      return { selection: { type: "plot", id: "plot-1" }, activeFieldTool: { type: "default" } };
    case "fresh-farm":
      return { selection: null, activeFieldTool: { type: "default" } };
  }
}

export function scenarioTitleLabel(scenarioId: BasicFarmScenarioId) {
  const scenario = getBasicFarmScenario(scenarioId);
  return `Scenario ${scenario.number.toString().padStart(2, "0")}: ${scenario.title}`;
}
