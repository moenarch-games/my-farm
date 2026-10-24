import { wikiPageHref } from "../scenarioRoutes";
import { getBasicFarmScenario, type BasicFarmScenarioId } from "@my-farm/game-model/basicFarmScenarios";

export function ScenarioBanner({ scenarioId }: { scenarioId: BasicFarmScenarioId }) {
  const scenario = getBasicFarmScenario(scenarioId);

  return (
    <aside className="scenario-banner" aria-label="Scenario lesson">
      <span>Scenario {scenario.number.toString().padStart(2, "0")}</span>
      <strong>{scenario.title}</strong>
      <a href={wikiPageHref()}>Wiki</a>
    </aside>
  );
}
