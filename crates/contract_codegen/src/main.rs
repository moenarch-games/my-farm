use anyhow::{Context, bail};
use my_farm_core::{
    AnimalReservationKey, AnimalShelterState, AnimalSlot, AnimalState, AutonomousPhase,
    BalanceConfig, BlockedResidentTask, BlockedResidentTaskView, CatalogDocument, CatalogResponse,
    CommandRequest, CommandResponse, ConcreteChain, ConcreteChainView, ConcreteCropTerms,
    ConcreteInput, ConcreteInputSource, ConcreteJob, ConcreteJobRequest, ConcreteJobView,
    ConcreteRecipeTerms, ConcreteWork, CropDef, DecorationDef, DecorationFootprint,
    DecorationPlacement, DeliveryOrder, FarmCommand, FarmEvent, FarmNotice, FarmNoticeKind,
    FarmResident, FarmResponse, FarmShopPriceView, FarmShopRejectionWindow, FarmShopSaleWindow,
    FarmShopState, FarmState, FarmView, FarmhouseUpgradeDef, FarmhouseUpgradeKind, FieldPlot,
    HarvestCargo, HarvestDepositReceipt, HealthResponse, HouseInterior, InventoryItemView, ItemDef,
    ItemKind, ItemStack, MachineDef, MachineJob, MachineKind, MachineState, MarketItemDef, OvenJob,
    OvenJobStatus, OvenState, PlantedCrop, RecipeDef, RecipeTarget, ReservationReasonView,
    ReservationView, ReservedPathTileView, ReservedWorkTarget, ResidentCarryItemView,
    ResidentCarryToolView, ResidentCarryView, ResidentCleanupBlock, ResidentInventory,
    ResidentPathState, ResidentScenePoint, ResidentSceneView, ResidentStepView, ResidentTargetKind,
    ResidentTargetView, ResidentTask, ResidentTaskKind, ResidentTaskPreviewView,
    ResidentTaskQueueState, ResidentTaskStep, ResidentTaskStepWork, ResidentTaskSummaryView,
    ResidentVisualActivity, ResidentVisualProp, ResidentWorkState, ResidentWorkView, Room,
    RoomTile, ShelterDef, ShelterKind, StorageKind, StorageSourceRef, StorageUpgradeDef,
    StructureKind, StructureTarget, SweepHarvestMode, Tile, ToolKind, ToolSourceRef, ToolStack,
    UnlockView, WebsocketClientMessage, WebsocketError, WebsocketServerMessage,
};
use schemars::{JsonSchema, schema_for};
use std::fs;
use std::path::{Path, PathBuf};
use ts_rs::TS;

fn main() -> anyhow::Result<()> {
    let check = std::env::args().any(|arg| arg == "--check");
    let root = workspace_root()?;
    let outputs = outputs()?;
    for output in outputs {
        let path = root.join(output.path);
        if check {
            let current = fs::read_to_string(&path)
                .with_context(|| format!("read generated contract {}", path.display()))?;
            if current != output.contents {
                bail!("contract drift detected at {}", path.display());
            }
        } else {
            if let Some(parent) = path.parent() {
                fs::create_dir_all(parent)?;
            }
            fs::write(&path, output.contents)
                .with_context(|| format!("write generated contract {}", path.display()))?;
        }
    }
    Ok(())
}

struct Output {
    path: &'static str,
    contents: String,
}

fn outputs() -> anyhow::Result<Vec<Output>> {
    let ts_config = ts_rs::Config::new();
    Ok(vec![
        json::<CatalogDocument>("contracts/generated/json/CatalogDocument.schema.json")?,
        json::<FarmState>("contracts/generated/json/FarmState.schema.json")?,
        json::<FarmView>("contracts/generated/json/FarmView.schema.json")?,
        json::<FarmCommand>("contracts/generated/json/FarmCommand.schema.json")?,
        json::<FarmEvent>("contracts/generated/json/FarmEvent.schema.json")?,
        json::<CommandRequest>("contracts/generated/json/CommandRequest.schema.json")?,
        json::<CommandResponse>("contracts/generated/json/CommandResponse.schema.json")?,
        json::<FarmResponse>("contracts/generated/json/FarmResponse.schema.json")?,
        json::<CatalogResponse>("contracts/generated/json/CatalogResponse.schema.json")?,
        json::<WebsocketClientMessage>(
            "contracts/generated/json/WebsocketClientMessage.schema.json",
        )?,
        json::<WebsocketError>("contracts/generated/json/WebsocketError.schema.json")?,
        json::<WebsocketServerMessage>(
            "contracts/generated/json/WebsocketServerMessage.schema.json",
        )?,
        json::<HealthResponse>("contracts/generated/json/HealthResponse.schema.json")?,
        ts_file(
            "contracts/generated/ts/my-farm.d.ts",
            &[
                HealthResponse::decl(&ts_config),
                BalanceConfig::decl(&ts_config),
                ItemStack::decl(&ts_config),
                ToolKind::decl(&ts_config),
                ToolStack::decl(&ts_config),
                ItemKind::decl(&ts_config),
                ItemDef::decl(&ts_config),
                CropDef::decl(&ts_config),
                MachineKind::decl(&ts_config),
                RecipeTarget::decl(&ts_config),
                ShelterKind::decl(&ts_config),
                StructureKind::decl(&ts_config),
                FarmhouseUpgradeKind::decl(&ts_config),
                StructureTarget::decl(&ts_config),
                SweepHarvestMode::decl(&ts_config),
                RecipeDef::decl(&ts_config),
                MachineDef::decl(&ts_config),
                FarmhouseUpgradeDef::decl(&ts_config),
                ShelterDef::decl(&ts_config),
                MarketItemDef::decl(&ts_config),
                StorageKind::decl(&ts_config),
                StorageUpgradeDef::decl(&ts_config),
                DecorationFootprint::decl(&ts_config),
                DecorationDef::decl(&ts_config),
                CatalogDocument::decl(&ts_config),
                CatalogResponse::decl(&ts_config),
                Tile::decl(&ts_config),
                PlantedCrop::decl(&ts_config),
                MachineJob::decl(&ts_config),
                FarmShopRejectionWindow::decl(&ts_config),
                FarmShopSaleWindow::decl(&ts_config),
                FarmShopState::decl(&ts_config),
                OvenJobStatus::decl(&ts_config),
                OvenJob::decl(&ts_config),
                OvenState::decl(&ts_config),
                AnimalState::decl(&ts_config),
                AnimalSlot::decl(&ts_config),
                FarmResident::decl(&ts_config),
                FarmNoticeKind::decl(&ts_config),
                FarmNotice::decl(&ts_config),
                ReservedWorkTarget::decl(&ts_config),
                StorageSourceRef::decl(&ts_config),
                ToolSourceRef::decl(&ts_config),
                ResidentTaskKind::decl(&ts_config),
                AutonomousPhase::decl(&ts_config),
                ResidentTaskStepWork::decl(&ts_config),
                ResidentTaskStep::decl(&ts_config),
                ResidentTask::decl(&ts_config),
                RoomTile::decl(&ts_config),
                DecorationPlacement::decl(&ts_config),
                Room::decl(&ts_config),
                HouseInterior::decl(&ts_config),
                ResidentInventory::decl(&ts_config),
                HarvestCargo::decl(&ts_config),
                HarvestDepositReceipt::decl(&ts_config),
                ResidentScenePoint::decl(&ts_config),
                ResidentWorkState::decl(&ts_config),
                ResidentPathState::decl(&ts_config),
                ResidentVisualActivity::decl(&ts_config),
                ResidentVisualProp::decl(&ts_config),
                ResidentTargetKind::decl(&ts_config),
                ResidentTargetView::decl(&ts_config),
                ResidentSceneView::decl(&ts_config),
                ResidentStepView::decl(&ts_config),
                ResidentTaskQueueState::decl(&ts_config),
                ResidentTaskPreviewView::decl(&ts_config),
                ResidentTaskSummaryView::decl(&ts_config),
                ResidentCarryItemView::decl(&ts_config),
                ResidentCarryToolView::decl(&ts_config),
                ResidentCarryView::decl(&ts_config),
                BlockedResidentTaskView::decl(&ts_config),
                ResidentWorkView::decl(&ts_config),
                ReservationReasonView::decl(&ts_config),
                AnimalReservationKey::decl(&ts_config),
                ReservedPathTileView::decl(&ts_config),
                ReservationView::decl(&ts_config),
                ResidentCleanupBlock::decl(&ts_config),
                BlockedResidentTask::decl(&ts_config),
                FarmState::decl(&ts_config),
                FieldPlot::decl(&ts_config),
                MachineState::decl(&ts_config),
                AnimalShelterState::decl(&ts_config),
                DeliveryOrder::decl(&ts_config),
                InventoryItemView::decl(&ts_config),
                FarmShopPriceView::decl(&ts_config),
                UnlockView::decl(&ts_config),
                FarmView::decl(&ts_config),
                ConcreteWork::decl(&ts_config),
                ConcreteInputSource::decl(&ts_config),
                ConcreteInput::decl(&ts_config),
                ConcreteJobRequest::decl(&ts_config),
                ConcreteRecipeTerms::decl(&ts_config),
                ConcreteCropTerms::decl(&ts_config),
                ConcreteJob::decl(&ts_config),
                ConcreteChain::decl(&ts_config),
                ConcreteJobView::decl(&ts_config),
                ConcreteChainView::decl(&ts_config),
                FarmCommand::decl(&ts_config),
                FarmEvent::decl(&ts_config),
                CommandRequest::decl(&ts_config),
                CommandResponse::decl(&ts_config),
                FarmResponse::decl(&ts_config),
                WebsocketClientMessage::decl(&ts_config),
                WebsocketError::decl(&ts_config),
                WebsocketServerMessage::decl(&ts_config),
            ],
        ),
    ])
}

fn json<T: JsonSchema>(path: &'static str) -> anyhow::Result<Output> {
    let contents = serde_json::to_string_pretty(&schema_for!(T))?;
    Ok(Output {
        path,
        contents: format!("{contents}\n"),
    })
}

fn ts_file(path: &'static str, declarations: &[String]) -> Output {
    let mut contents = String::from(
        "/* eslint-disable */\n// Generated by contract_codegen. Do not edit by hand.\n\n",
    );
    for declaration in declarations {
        contents.push_str("export ");
        contents.push_str(declaration);
        contents.push_str("\n\n");
    }
    Output { path, contents }
}

fn workspace_root() -> anyhow::Result<PathBuf> {
    let manifest_dir = Path::new(env!("CARGO_MANIFEST_DIR"));
    manifest_dir
        .ancestors()
        .nth(2)
        .map(Path::to_path_buf)
        .context("resolve workspace root")
}
