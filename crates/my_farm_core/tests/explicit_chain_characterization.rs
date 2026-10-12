//! Independent #225 characterization; existing manual production remains supported.
#[path = "acceptance/explicit_chain_fixture.rs"]
mod fixture;
use fixture::*;
use my_farm_core::{
    CatalogDocument, FarmCommand, OvenJobStatus, apply_elapsed, inventory_quantity,
};

#[test]
fn actual_queued_harvest_can_back_an_existing_manual_oven_start() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = ripe_farm(&catalog);
    accepted(
        &mut farm,
        &catalog,
        FarmCommand::SweepHarvest {
            plot_ids: vec!["plot-1".into(), "plot-2".into()],
            harvest_mode: None,
        },
    );
    sell_stored_wheat(&mut farm, &catalog);
    assert_eq!(inventory_quantity(&farm, "wheat"), 0);
    accepted(
        &mut farm,
        &catalog,
        FarmCommand::QueueOvenRecipe {
            recipe_id: "bread".into(),
        },
    );
    finish_tasks(&mut farm, &catalog);
    assert_eq!(farm.oven.queue.len(), 1);
    assert_eq!(farm.oven.queue[0].status, OvenJobStatus::Producing);
    assert_eq!(inventory_quantity(&farm, "wheat"), 1);
    assert_eq!(inventory_quantity(&farm, "bread"), 0);
}

#[test]
fn current_manual_collection_requires_readiness_and_physically_deposits_bread() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = oven_farm(&catalog);
    accepted(
        &mut farm,
        &catalog,
        FarmCommand::QueueOvenRecipe {
            recipe_id: "bread".into(),
        },
    );
    finish_tasks(&mut farm, &catalog);
    let before = state(&farm);
    let now = farm.last_update_ms;
    let rejected =
        my_farm_core::apply_command(&mut farm, &catalog, FarmCommand::CollectOvenJob, now);
    assert!(!rejected.accepted);
    assert!(rejected.error.unwrap().message.contains("not ready"));
    assert_eq!(state(&farm), before);
    let ready = farm.oven.queue[0].ready_at_ms;
    apply_elapsed(&mut farm, &catalog, ready);
    assert_eq!(
        inventory_quantity(&farm, "bread"),
        0,
        "ready output is not stored Bread"
    );
    accepted(&mut farm, &catalog, FarmCommand::CollectOvenJob);
    assert_eq!(
        inventory_quantity(&farm, "bread"),
        0,
        "admitted collection is not completed deposit"
    );
    finish_tasks(&mut farm, &catalog);
    assert_eq!(inventory_quantity(&farm, "bread"), 1);
    assert_eq!(inventory_quantity(&farm, "wheat"), 3);
    assert!(farm.oven.queue.is_empty());
    assert!(
        farm.resident_inventories
            .values()
            .all(|inventory| inventory.items.is_empty() && inventory.tools.is_empty())
    );
}

#[test]
fn existing_manual_harvest_executes_zero_duration_tool_pickup_before_returning() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = ripe_farm(&catalog);
    sell_stored_wheat(&mut farm, &catalog);
    accepted(
        &mut farm,
        &catalog,
        FarmCommand::HarvestCrop {
            plot_id: "plot-1".into(),
        },
    );
    assert_eq!(
        farm.resident_inventories["woman"]
            .tools
            .get(&my_farm_core::ToolKind::Sickle),
        Some(&1)
    );
    assert!(
        farm.resident_task_queues["woman"][0]
            .steps
            .iter()
            .any(|step| matches!(
                step.work,
                my_farm_core::ResidentTaskStepWork::HarvestCrop { .. }
            ))
    );
    conserved(&farm);
    finish_tasks(&mut farm, &catalog);
    assert_eq!(inventory_quantity(&farm, "wheat"), 2);
    assert!(farm.resident_inventories["woman"].tools.is_empty());
}
