//! Source-only fixture helpers: every production transition uses public Rust commands/time.
use my_farm_core::{
    CatalogDocument, FarmCommand, FarmState, FarmhouseUpgradeKind, ToolKind, apply_command,
    apply_elapsed, inventory_quantity, new_farm,
};
use serde_json::Value;

pub fn state(farm: &FarmState) -> Value {
    serde_json::to_value(farm).unwrap()
}
pub fn accepted(farm: &mut FarmState, catalog: &CatalogDocument, command: FarmCommand) {
    let now = farm.last_update_ms;
    let outcome = apply_command(farm, catalog, command, now);
    assert!(
        outcome.accepted,
        "actual command rejected: {:?}",
        outcome.error
    );
}
pub fn conserved(farm: &FarmState) {
    for tool in [
        ToolKind::Hoe,
        ToolKind::Sickle,
        ToolKind::MixingBowl,
        ToolKind::OvenMitt,
    ] {
        let total = farm.farmhouse_tool_stock.get(&tool).copied().unwrap_or(0)
            + farm
                .resident_inventories
                .values()
                .map(|inventory| inventory.tools.get(&tool).copied().unwrap_or(0))
                .sum::<u32>();
        assert_eq!(total, 1, "physical Tool custody: {tool:?}");
    }
}
pub fn next_task(farm: &FarmState) -> Option<i64> {
    farm.resident_task_queues
        .values()
        .filter_map(|queue| queue.first())
        .map(|task| task.ready_at_ms.max(farm.last_update_ms + 1))
        .min()
}
pub fn finish_tasks(farm: &mut FarmState, catalog: &CatalogDocument) {
    for _ in 0..256 {
        conserved(farm);
        assert!(
            farm.blocked_resident_tasks.is_empty(),
            "unexpected blocked work: {:?}",
            farm.blocked_resident_tasks
        );
        let Some(next) = next_task(farm) else { return };
        apply_elapsed(farm, catalog, next);
    }
    panic!("bounded tiny fixture failed to settle actual tasks");
}
pub fn oven_farm(catalog: &CatalogDocument) -> FarmState {
    let mut farm = new_farm(0, catalog);
    // Consistent level/XP setup owned by this input fixture, never fake outputs.
    farm.xp = 4;
    farm.level = catalog.level_for_xp(farm.xp);
    assert_eq!(farm.level, 2);
    accepted(
        &mut farm,
        catalog,
        FarmCommand::BuyFarmhouseUpgrade {
            upgrade_kind: FarmhouseUpgradeKind::Oven,
        },
    );
    farm
}
pub fn ripe_farm(catalog: &CatalogDocument) -> FarmState {
    let mut farm = oven_farm(catalog);
    for plot in ["plot-1", "plot-2"] {
        accepted(
            &mut farm,
            catalog,
            FarmCommand::PlantCrop {
                plot_id: plot.into(),
                crop_id: "wheat".into(),
            },
        );
    }
    finish_tasks(&mut farm, catalog);
    let ripe = farm
        .field_plots
        .iter()
        .filter_map(|plot| plot.crop.as_ref())
        .map(|crop| crop.ready_at_ms)
        .max()
        .unwrap();
    let now = ripe.max(farm.last_update_ms);
    apply_elapsed(&mut farm, catalog, now);
    farm
}
pub fn sell_stored_wheat(farm: &mut FarmState, catalog: &CatalogDocument) {
    let quantity = inventory_quantity(farm, "wheat");
    if quantity > 0 {
        accepted(
            farm,
            catalog,
            FarmCommand::SellMarketItem {
                item_id: "wheat".into(),
                quantity,
            },
        );
    }
}
