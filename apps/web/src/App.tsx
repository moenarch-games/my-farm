import { useRef, useState } from "react";
import type { BasicFarmScenarioId } from "@my-farm/game-model/basicFarmScenarios";
import { createFarmClient } from "./api";
import { InteractionToolSelector } from "./components/InteractionToolSelector";
import { appRouteFromLocation, type AppRoute } from "./scenarioRoutes";
import { ScenarioBanner } from "./app/ScenarioBanner";
import { StandaloneWikiPage } from "./app/StandaloneWikiPage";
import { scenarioSceneConfig, scenarioTitleLabel } from "./app/scenarioScene";
import { useMediaQuery } from "./app/useMediaQuery";
import { BuildTray } from "./features/building/BuildTray";
import { Orders } from "./features/deliveries/DeliveryOrders";
import { FarmContextMenu } from "./features/farmInteraction/FarmContextMenu";
import { useFarmInteraction } from "./features/farmInteraction/useFarmInteraction";
import { FarmWorld, farmToolClass } from "./features/farmScene/FarmWorld";
import { FarmGuidanceOverlay } from "./features/guidance/FarmGuidanceOverlay";
import { useFarmGuidance } from "./features/guidance/useFarmGuidance";
import { HouseInterior } from "./features/houseInterior/HouseInterior";
import { useHouseInteriorController } from "./features/houseInterior/useHouseInteriorController";
import { TopBar } from "./features/hud/TopBar";
import { MainMenu } from "./features/mainMenu/MainMenu";
import { FarmersMarket } from "./features/market/FarmersMarket";
import { MobileFarmHud } from "./features/mobile/MobileFarmHud";
import { CompactResidentSelector } from "./features/residents/ResidentSelectors";
import { useFarmRuntime } from "./features/runtime/useFarmRuntime";
import { SelectionPanel } from "./features/selection/SelectionPanel";

const client = createFarmClient();
const demoMode = client.runtime === "wasm_demo";

type GameScreen = "main_menu" | "playing";
type PlayScene = "farm" | "house_interior";

export function App() {
  const [initialRoute] = useState<AppRoute>(() => appRouteFromLocation());
  if (initialRoute.type === "wiki") {
    return <StandaloneWikiPage demoMode={demoMode} />;
  }
  return <FarmGame scenarioId={initialRoute.type === "scenario" ? initialRoute.scenarioId : null} />;
}

/**
 * Screen orchestration for one farm session: wires the runtime and feature
 * controllers into the main menu, farm and house screens. Feature state lives
 * in the controllers; this component only owns screen/scene routing.
 */
function FarmGame({ scenarioId }: { scenarioId: BasicFarmScenarioId | null }) {
  const [scenarioScene] = useState(() => (scenarioId ? scenarioSceneConfig(scenarioId) : null));
  const runtime = useFarmRuntime({
    client,
    initialMessage: scenarioId
      ? `Loading ${scenarioTitleLabel(scenarioId)}...`
      : demoMode ? "Loading browser demo..." : "Connecting to local server...",
    loadedMessage: scenarioId
      ? scenarioTitleLabel(scenarioId)
      : demoMode ? "Demo farm loaded" : "Local farm synced",
  });
  const { catalog, view, nowMs, send, notify } = runtime;
  const interaction = useFarmInteraction({
    catalog,
    view,
    nowMs,
    send,
    notify,
    initialSelection: scenarioScene?.selection ?? null,
    initialFieldTool: scenarioScene?.activeFieldTool ?? { type: "default" },
  });
  const house = useHouseInteriorController({ catalog, view, send, notify });
  const guidance = useFarmGuidance({ view, enabled: !scenarioId });
  const [screen, setScreen] = useState<GameScreen>(scenarioId ? "playing" : "main_menu");
  const [playScene, setPlayScene] = useState<PlayScene>("farm");
  const [marketOpen, setMarketOpen] = useState(false);
  const mobileLayout = useMediaQuery("(max-width: 760px)");
  const ordersRef = useRef<HTMLElement | null>(null);

  const startNewFarm = async () => {
    await runtime.reset(() => {
      interaction.reset();
      house.clearDecorationSelection();
      setMarketOpen(false);
      guidance.reset();
    });
    setScreen("playing");
  };

  const openMainMenu = () => {
    interaction.dismissTools();
    setMarketOpen(false);
    setScreen("main_menu");
  };

  const openMarket = () => {
    if (demoMode) {
      notify("Farmers Market is not available in the demo");
      return;
    }
    setMarketOpen(true);
    interaction.dismissTools();
    notify("Farmers Market open");
  };

  const viewDeliveryOrders = () => {
    interaction.viewDeliveryOrders();
    window.setTimeout(() => {
      ordersRef.current?.scrollIntoView({ block: "nearest" });
      ordersRef.current?.focus({ preventScroll: true });
    }, 0);
  };

  const enterHouseInterior = () => {
    interaction.enterHouseInterior();
    house.openOverview();
    setPlayScene("house_interior");
    notify("Entered House Interior");
  };

  const returnToFarmScene = () => {
    setPlayScene("farm");
    notify("Returned to Farm");
  };

  if (!view || !catalog) {
    return (
      <main className="app loading">
        <p>{runtime.message}</p>
      </main>
    );
  }

  const playing = screen === "playing";
  const onFarm = playing && playScene === "farm";
  const { selection } = interaction;

  return (
    <main className={`app ${farmToolClass(interaction)}`}>
      <div className="gameplay-surface">
        {playing && playScene === "house_interior" ? (
          <HouseInterior
            catalog={catalog}
            view={view}
            nowMs={nowMs}
            controller={house}
            send={send}
            onBackToFarm={returnToFarmScene}
          />
        ) : (
          <FarmWorld catalog={catalog} view={view} nowMs={nowMs} interaction={interaction} showResidentPath={onFarm} />
        )}
        {onFarm ? (
          <>
            <TopBar
              catalog={catalog}
              view={view}
              message={runtime.message}
              connectionStatus={runtime.connectionStatus}
              onOpenMenu={openMainMenu}
            />
            {scenarioId ? <ScenarioBanner scenarioId={scenarioId} /> : null}
            {!mobileLayout ? (
              <aside className="side-panel">
                <CompactResidentSelector
                  catalog={catalog}
                  view={view}
                  nowMs={nowMs}
                  onSelectResident={interaction.selectResidentForWork}
                />
                <InteractionToolSelector
                  catalog={catalog}
                  view={view}
                  activeFieldTool={interaction.activeFieldTool}
                  buildToolSelected={interaction.buildToolSelected}
                  harvestMode={interaction.harvestMode}
                  plantSweep={interaction.plantSweep}
                  harvestSweep={interaction.harvestSweep}
                  onDefault={interaction.selectDefaultFieldTool}
                  onPlant={interaction.selectPlantFieldTool}
                  onHarvest={interaction.selectHarvestFieldTool}
                  onHarvestMode={interaction.selectHarvestMode}
                  onBuild={interaction.selectBuildTool}
                />
                {selection ? (
                  <SelectionPanel
                    catalog={catalog}
                    view={view}
                    selection={selection}
                    nowMs={nowMs}
                    send={send}
                    demoMode={demoMode}
                    selectedTaskPreview={interaction.selectedTaskPreview}
                    onPreviewTask={interaction.previewTask}
                    onClearSelection={interaction.clearSelection}
                    onEnterHouseInterior={enterHouseInterior}
                  />
                ) : null}
                {!demoMode && selection?.type === "delivery_board" ? (
                  <Orders catalog={catalog} view={view} send={send} ordersRef={ordersRef} />
                ) : null}
              </aside>
            ) : (
              <MobileFarmHud
                catalog={catalog}
                view={view}
                selection={selection}
                nowMs={nowMs}
                send={send}
                demoMode={demoMode}
                activeFieldTool={interaction.activeFieldTool}
                buildToolSelected={interaction.buildToolSelected}
                harvestMode={interaction.harvestMode}
                plantSweep={interaction.plantSweep}
                selectedTaskPreview={interaction.selectedTaskPreview}
                onDefault={interaction.selectDefaultFieldTool}
                onPlant={interaction.selectPlantFieldTool}
                onHarvest={interaction.selectHarvestFieldTool}
                onHarvestMode={interaction.selectHarvestMode}
                onBuild={interaction.selectBuildTool}
                onSelectResident={interaction.selectResidentForWork}
                onPreviewTask={interaction.previewTask}
                onClearSelection={interaction.clearSelection}
                onEnterHouseInterior={enterHouseInterior}
              />
            )}
            {!demoMode && marketOpen ? (
              <FarmersMarket catalog={catalog} view={view} send={send} onClose={() => setMarketOpen(false)} />
            ) : null}
            {interaction.buildToolSelected ? (
              <BuildTray
                catalog={catalog}
                view={view}
                selectedKind={interaction.selectedBuildKind}
                buildPlacement={interaction.buildPlacement}
                demoMode={demoMode}
                onInspectKind={interaction.inspectBuildKind}
                onSelectKind={interaction.selectBuildKind}
              />
            ) : null}
          </>
        ) : null}
        {!playing ? (
          <MainMenu
            view={view}
            message={runtime.message}
            demoMode={demoMode}
            onContinue={() => setScreen("playing")}
            onNewFarm={startNewFarm}
            onOpenMarket={() => {
              setScreen("playing");
              openMarket();
            }}
          />
        ) : null}
        {playing ? (
          <FarmContextMenu
            catalog={catalog}
            view={view}
            nowMs={nowMs}
            demoMode={demoMode}
            interaction={interaction}
            send={send}
            onViewOrders={viewDeliveryOrders}
          />
        ) : null}
      </div>
      {onFarm ? (
        <FarmGuidanceOverlay
          controller={guidance}
          view={view}
          residentSelected={selection?.type === "resident"}
          onInspect={interaction.select}
        />
      ) : null}
    </main>
  );
}
