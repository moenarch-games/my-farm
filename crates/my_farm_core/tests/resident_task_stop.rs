//! Independent acceptance for #221, the core-only safe-stop prerequisite of #134.
//! Commands, time, save loading and views remain the actual Rust authority.
use my_farm_core::{
    CatalogDocument, CommandOutcome, FarmCommand, FarmState, FarmhouseUpgradeKind, OvenJobStatus,
    ResidentTaskStepWork, Tile, ToolKind, apply_command, apply_elapsed, farm_view,
    inventory_quantity, new_farm,
};
use serde_json::{Value, json};

fn state(farm: &FarmState) -> Value {
    serde_json::to_value(farm).unwrap()
}

fn reload(farm: &FarmState) -> FarmState {
    serde_json::from_value(state(farm)).unwrap()
}

fn accepted(farm: &mut FarmState, catalog: &CatalogDocument, command: FarmCommand) {
    let now = farm.last_update_ms;
    let outcome = apply_command(farm, catalog, command, now);
    assert!(
        outcome.accepted,
        "real command rejected: {:?}",
        outcome.error
    );
}

// Routine wire proposal, independently translatable without changing outcomes.
// This uses the real public command deserializer, not a replacement executor.
fn stop(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    resident: &str,
    task: &str,
) -> CommandOutcome {
    let command = serde_json::from_value(json!({
        "type": "cancel_resident_task", "resident_id": resident, "task_id": task,
    }))
    .expect("core must expose stable-identity CancelResidentTask intent (#221)");
    apply_command(farm, catalog, command, farm.last_update_ms)
}

fn stop_accepted(farm: &mut FarmState, catalog: &CatalogDocument, task: &str) {
    let outcome = stop(farm, catalog, "woman", task);
    assert!(outcome.accepted, "safe stop rejected: {:?}", outcome.error);
}

fn select(farm: &mut FarmState, catalog: &CatalogDocument, resident: &str) {
    accepted(
        farm,
        catalog,
        FarmCommand::SelectResident {
            resident_id: resident.into(),
        },
    );
}

fn plant(farm: &mut FarmState, catalog: &CatalogDocument, plot: &str) {
    accepted(
        farm,
        catalog,
        FarmCommand::PlantCrop {
            plot_id: plot.into(),
            crop_id: "wheat".into(),
        },
    );
}

fn conserved(farm: &FarmState) {
    for tool in [ToolKind::Hoe, ToolKind::Sickle] {
        let physical = farm.farmhouse_tool_stock.get(&tool).copied().unwrap_or(0)
            + farm
                .resident_inventories
                .values()
                .map(|inventory| inventory.tools.get(&tool).copied().unwrap_or(0))
                .sum::<u32>();
        assert_eq!(physical, 1, "Tool duplicated or lost: {tool:?}");
    }
}

fn finish(farm: &mut FarmState, catalog: &CatalogDocument) {
    // A fixture safeguard, not a product timeout: advance actual queued deadlines.
    for _ in 0..128 {
        if farm.resident_task_queues.values().all(Vec::is_empty) {
            conserved(farm);
            assert!(
                farm.resident_inventories
                    .values()
                    .all(|i| i.items.is_empty() && i.tools.is_empty())
            );
            return;
        }
        let next = farm
            .resident_task_queues
            .values()
            .filter_map(|q| q.first())
            .map(|task| task.ready_at_ms)
            .min()
            .unwrap()
            .max(farm.last_update_ms + 1);
        apply_elapsed(farm, catalog, next);
        conserved(farm);
        assert!(
            farm.blocked_resident_tasks.is_empty(),
            "valid cleanup blocked: {:?}",
            farm.blocked_resident_tasks
        );
    }
    panic!("small real fixture did not finish");
}

fn task_id(farm: &FarmState) -> String {
    farm.resident_task_queues["woman"][0].id.clone()
}

fn head_is(farm: &FarmState, predicate: impl Fn(&ResidentTaskStepWork) -> bool) -> bool {
    farm.resident_task_queues["woman"]
        .first()
        .is_some_and(|task| predicate(&task.steps[0].work))
}

fn advance_to(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    predicate: impl Fn(&ResidentTaskStepWork) -> bool,
) {
    for _ in 0..64 {
        if head_is(farm, &predicate) {
            return;
        }
        let at = farm.resident_task_queues["woman"][0]
            .ready_at_ms
            .max(farm.last_update_ms + 1);
        apply_elapsed(farm, catalog, at);
        assert!(farm.blocked_resident_tasks.is_empty());
    }
    panic!("required actual lifecycle boundary absent");
}

fn plant_fixture(catalog: &CatalogDocument) -> FarmState {
    let mut farm = new_farm(0, catalog);
    // Valid initial resident position ensures an observable physical pickup walk.
    farm.resident_locations
        .insert("woman".into(), Tile::new(1, 1));
    plant(&mut farm, catalog, "plot-1");
    farm
}

fn harvest_fixture(catalog: &CatalogDocument, plots: &[&str]) -> FarmState {
    let mut farm = new_farm(0, catalog);
    for plot in plots {
        plant(&mut farm, catalog, plot);
    }
    finish(&mut farm, catalog);
    let ripe = farm
        .field_plots
        .iter()
        .filter_map(|p| p.crop.as_ref())
        .map(|crop| crop.ready_at_ms)
        .max()
        .unwrap();
    let now = ripe.max(farm.last_update_ms + 1);
    apply_elapsed(&mut farm, catalog, now);
    // No task is running here: valid initial handoff location creates a real Tool pickup walk.
    farm.resident_locations
        .insert("woman".into(), Tile::new(1, 1));
    accepted(
        &mut farm,
        catalog,
        FarmCommand::SweepHarvest {
            plot_ids: plots.iter().map(|id| (*id).into()).collect(),
            harvest_mode: None,
        },
    );
    farm
}

fn crop_exists(farm: &FarmState, plot: &str) -> bool {
    farm.field_plots
        .iter()
        .find(|p| p.id == plot)
        .unwrap()
        .crop
        .is_some()
}

fn stopping(farm: &FarmState, catalog: &CatalogDocument) -> bool {
    // Routine view-field proposal: activity itself must remain truthful while stopping.
    serde_json::to_value(farm_view(farm, catalog)).unwrap()["resident_work"]["woman"]["stop_requested"]
        .as_bool().expect("read model must expose pending stop separately from real activity")
}

#[test]
fn characterization_normal_plant_and_harvest_reach_real_carry_deposit_and_return() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = harvest_fixture(&catalog, &["plot-1"]);
    advance_to(&mut farm, &catalog, |work| {
        matches!(work, ResidentTaskStepWork::DepositItems { .. })
    });
    assert!(!crop_exists(&farm, "plot-1"));
    assert_eq!(farm.resident_inventories["woman"].items["wheat"], 2);
    assert_eq!(inventory_quantity(&farm, "wheat"), 5);
    assert_eq!(
        farm.resident_inventories["woman"].tools[&ToolKind::Sickle],
        1
    );
    finish(&mut farm, &catalog);
    assert_eq!(inventory_quantity(&farm, "wheat"), 7);
    assert!(farm.resident_last_harvest_deposit.contains_key("woman"));
}

#[test]
fn characterization_actual_pickup_walk_work_deposit_return_boundaries_are_observable() {
    let catalog = CatalogDocument::default_catalog();
    for boundary in ["items", "tools", "plant", "harvest", "deposit", "return"] {
        let mut farm = if matches!(boundary, "items" | "plant") {
            plant_fixture(&catalog)
        } else {
            harvest_fixture(&catalog, &["plot-1"])
        };
        advance_to(&mut farm, &catalog, |work| match boundary {
            "items" => matches!(work, ResidentTaskStepWork::PickupItems { .. }),
            "tools" => matches!(work, ResidentTaskStepWork::PickupTools { .. }),
            "plant" => matches!(work, ResidentTaskStepWork::PlantCrop { .. }),
            "harvest" => matches!(work, ResidentTaskStepWork::HarvestCrop { .. }),
            "deposit" => matches!(work, ResidentTaskStepWork::DepositItems { .. }),
            "return" => matches!(work, ResidentTaskStepWork::ReturnTools { .. }),
            _ => unreachable!(),
        });
        assert!(farm.resident_task_queues["woman"][0].ready_at_ms > farm.last_update_ms);
        conserved(&farm);
        finish(&mut farm, &catalog);
    }
}

#[test]
fn characterization_exceptional_saved_faults_preserve_real_queue_carry_and_outcomes_on_load() {
    let catalog = CatalogDocument::default_catalog();
    let mut real = harvest_fixture(&catalog, &["plot-1"]);
    advance_to(&mut real, &catalog, |work| {
        matches!(work, ResidentTaskStepWork::DepositItems { .. })
    });
    for (key, fault) in [
        ("silo_capacity", json!(inventory_quantity(&real, "wheat"))),
        ("silo_tile", json!({"x": -100, "y": -100})),
    ] {
        let mut saved = state(&real);
        saved[key] = fault;
        let loaded: FarmState = serde_json::from_value(saved.clone()).expect(
            "baseline load boundary accepts this explicitly exceptional isolated saved-input fault",
        );
        let mut expected = state(&real);
        expected[key] = saved[key].clone();
        assert_eq!(
            state(&loaded),
            expected,
            "fault loading must not invent outcome or custody"
        );
    }
}

#[test]
fn queued_selected_task_never_starts_and_other_resident_commitment_is_unchanged() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = plant_fixture(&catalog);
    plant(&mut farm, &catalog, "plot-2");
    let cancelled = farm.resident_task_queues["woman"][1].id.clone();
    select(&mut farm, &catalog, "man");
    plant(&mut farm, &catalog, "plot-3");
    let other = farm.resident_task_queues["man"].clone();
    let first = farm.resident_task_queues["woman"][0].clone();
    stop_accepted(&mut farm, &catalog, &cancelled);
    assert_eq!(farm.resident_task_queues["man"], other);
    assert_eq!(farm.resident_task_queues["woman"][0], first);
    assert!(
        farm.resident_task_queues["woman"]
            .iter()
            .all(|task| task.id != cancelled)
    );
    finish(&mut farm, &catalog);
    assert!(crop_exists(&farm, "plot-1"));
    assert!(!crop_exists(&farm, "plot-2"));
    assert!(crop_exists(&farm, "plot-3"));
    assert_eq!(inventory_quantity(&farm, "wheat"), 4);
}

#[test]
fn active_selected_stop_preserves_separately_accepted_following_task() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = plant_fixture(&catalog);
    let id = task_id(&farm);
    plant(&mut farm, &catalog, "plot-2");
    let retained = farm.resident_task_queues["woman"][1].id.clone();
    stop_accepted(&mut farm, &catalog, &id);
    assert!(
        farm.resident_task_queues["woman"]
            .iter()
            .any(|task| task.id == retained)
    );
    finish(&mut farm, &catalog);
    assert!(!crop_exists(&farm, "plot-1"));
    assert!(crop_exists(&farm, "plot-2"));
    assert_eq!(inventory_quantity(&farm, "wheat"), 5);
}

fn dependent_oven_fixture(catalog: &CatalogDocument) -> FarmState {
    let mut farm = harvest_fixture(catalog, &["plot-1", "plot-2"]);
    farm.xp = 4;
    farm.level = 2;
    accepted(
        &mut farm,
        catalog,
        FarmCommand::BuyFarmhouseUpgrade {
            upgrade_kind: FarmhouseUpgradeKind::Oven,
        },
    );
    let stored = inventory_quantity(&farm, "wheat");
    accepted(
        &mut farm,
        catalog,
        FarmCommand::SellMarketItem {
            item_id: "wheat".into(),
            quantity: stored,
        },
    );
    accepted(
        &mut farm,
        catalog,
        FarmCommand::QueueOvenRecipe {
            recipe_id: "bread".into(),
        },
    );
    assert_eq!(inventory_quantity(&farm, "wheat"), 0);
    assert_eq!(farm.resident_task_queues["woman"].len(), 2);
    farm
}

#[test]
fn characterization_accepted_future_oven_inputs_can_depend_on_earlier_real_harvest() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = dependent_oven_fixture(&catalog);
    finish(&mut farm, &catalog);
    assert_eq!(farm.oven.queue.len(), 1);
    assert_ne!(farm.oven.queue[0].started_at_ms, 0);
    assert_eq!(inventory_quantity(&farm, "wheat"), 1);
}

#[test]
fn cancelling_required_future_inputs_of_separate_accepted_task_rejects_atomically() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = dependent_oven_fixture(&catalog);
    let id = task_id(&farm);
    let before = state(&farm);
    let rejected = stop(&mut farm, &catalog, "woman", &id);
    assert!(
        !rejected.accepted,
        "must not silently break the separately accepted Oven start"
    );
    let message = rejected.error.unwrap().message.to_lowercase();
    assert!(
        ["depend", "input", "reservation", "accepted", "following"]
            .iter()
            .any(|word| message.contains(word)),
        "unrelated reason: {message}"
    );
    assert_eq!(state(&farm), before);
    finish(&mut farm, &catalog);
    assert_eq!(farm.oven.queue.len(), 1);
    assert_eq!(inventory_quantity(&farm, "wheat"), 1);
}

#[test]
fn stop_during_real_item_pickup_finishes_pickup_then_returns_items_without_planting() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = plant_fixture(&catalog);
    advance_to(&mut farm, &catalog, |work| {
        matches!(work, ResidentTaskStepWork::PickupItems { .. })
    });
    let id = task_id(&farm);
    let ready = farm.resident_task_queues["woman"][0].ready_at_ms;
    let before = state(&farm);
    stop_accepted(&mut farm, &catalog, &id);
    assert!(stopping(&farm, &catalog));
    assert_eq!(
        inventory_quantity(&farm, "wheat"),
        before["inventory"]["wheat"].as_u64().unwrap() as u32
    );
    apply_elapsed(&mut farm, &catalog, ready);
    assert!(!crop_exists(&farm, "plot-1"));
    finish(&mut farm, &catalog);
    assert_eq!(inventory_quantity(&farm, "wheat"), 6);
    assert!(!stopping(&farm, &catalog));
}

#[test]
fn stop_during_real_tool_pickup_returns_source_tool_without_starting_later_work() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = harvest_fixture(&catalog, &["plot-1"]);
    advance_to(&mut farm, &catalog, |work| {
        matches!(work, ResidentTaskStepWork::PickupTools { .. })
    });
    let id = task_id(&farm);
    stop_accepted(&mut farm, &catalog, &id);
    finish(&mut farm, &catalog);
    assert!(crop_exists(&farm, "plot-1"));
    assert_eq!(inventory_quantity(&farm, "wheat"), 5);
    assert_eq!(farm.farmhouse_tool_stock[&ToolKind::Sickle], 1);
}

fn active_plant_stop(at_work: bool) {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = plant_fixture(&catalog);
    advance_to(&mut farm, &catalog, |work| {
        matches!(work, ResidentTaskStepWork::PlantCrop { .. })
    });
    let step = farm.resident_task_queues["woman"][0].steps[0].clone();
    assert!(step.walk_duration_ms > 0 && step.work_duration_ms > 0);
    if at_work {
        let at = farm.resident_task_queues["woman"][0].started_at_ms + step.walk_duration_ms;
        apply_elapsed(&mut farm, &catalog, at);
    }
    let ready = farm.resident_task_queues["woman"][0].ready_at_ms;
    let id = task_id(&farm);
    stop_accepted(&mut farm, &catalog, &id);
    assert!(stopping(&farm, &catalog));
    assert!(!crop_exists(&farm, "plot-1"));
    apply_elapsed(&mut farm, &catalog, ready);
    assert!(crop_exists(&farm, "plot-1"));
    let planted = farm.field_plots.clone();
    finish(&mut farm, &catalog);
    assert_eq!(farm.field_plots, planted);
    assert_eq!(
        inventory_quantity(&farm, "wheat"),
        5,
        "consumed seed must not be refunded"
    );
}

#[test]
fn stop_during_walk_finishes_that_active_work_step() {
    active_plant_stop(false);
}

#[test]
fn stop_during_work_finishes_once_and_preserves_consumed_input() {
    active_plant_stop(true);
}

#[test]
fn sweep_stop_finishes_active_harvest_but_never_harvests_future_plot() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = harvest_fixture(&catalog, &["plot-1", "plot-2"]);
    advance_to(&mut farm, &catalog, |work| {
        matches!(work, ResidentTaskStepWork::HarvestCrop { .. })
    });
    let id = task_id(&farm);
    let prior_xp = farm.xp;
    stop_accepted(&mut farm, &catalog, &id);
    finish(&mut farm, &catalog);
    assert!(!crop_exists(&farm, "plot-1"));
    assert!(crop_exists(&farm, "plot-2"));
    assert_eq!(inventory_quantity(&farm, "wheat"), 6);
    assert_eq!(farm.xp, prior_xp + catalog.crop("wheat").unwrap().xp);
    assert_eq!(farm.resident_last_harvest_deposit["woman"].task_id, id);
}

#[test]
fn stop_at_deposit_and_tool_return_preserves_completed_output_once() {
    for return_boundary in [false, true] {
        let catalog = CatalogDocument::default_catalog();
        let mut farm = harvest_fixture(&catalog, &["plot-1"]);
        advance_to(&mut farm, &catalog, |work| {
            if return_boundary {
                matches!(work, ResidentTaskStepWork::ReturnTools { .. })
            } else {
                matches!(work, ResidentTaskStepWork::DepositItems { .. })
            }
        });
        let id = task_id(&farm);
        stop_accepted(&mut farm, &catalog, &id);
        finish(&mut farm, &catalog);
        let completed = state(&farm);
        let now = farm.last_update_ms;
        apply_elapsed(&mut farm, &catalog, now);
        assert_eq!(state(&farm), completed);
        assert_eq!(inventory_quantity(&farm, "wheat"), 7);
        assert_eq!(farm.farmhouse_tool_stock[&ToolKind::Sickle], 1);
    }
}

#[test]
fn repeated_stop_reload_and_stale_identity_cannot_touch_newly_queued_work() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = plant_fixture(&catalog);
    let id = task_id(&farm);
    stop_accepted(&mut farm, &catalog, &id);
    let pending = state(&farm);
    let repeat = stop(&mut farm, &catalog, "woman", &id);
    assert!(repeat.accepted || repeat.error.is_some());
    assert_eq!(
        state(&farm),
        pending,
        "duplicate stop must not add cleanup or retime work"
    );
    farm = reload(&farm);
    assert!(stopping(&farm, &catalog));
    finish(&mut farm, &catalog);
    plant(&mut farm, &catalog, "plot-2");
    let fresh_id = task_id(&farm);
    assert_ne!(fresh_id, id);
    let before = state(&farm);
    let stale = stop(&mut farm, &catalog, "woman", &id);
    assert!(!stale.accepted);
    assert!(stale.error.is_some_and(|error| !error.message.is_empty()));
    assert_eq!(state(&farm), before);
    finish(&mut farm, &catalog);
    assert!(crop_exists(&farm, "plot-2"));
}

#[test]
fn unknown_resident_and_task_are_useful_atomic_rejections_at_settled_time() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = plant_fixture(&catalog);
    let id = task_id(&farm);
    for (resident, task, useful) in [
        ("missing-resident", id.as_str(), "resident"),
        ("woman", "missing-task", "task"),
    ] {
        let before = state(&farm);
        let rejected = stop(&mut farm, &catalog, resident, task);
        assert!(!rejected.accepted);
        let message = rejected.error.unwrap().message.to_lowercase();
        assert!(message.contains(useful), "unrelated rejection: {message}");
        assert_eq!(state(&farm), before);
    }
}

#[test]
fn saved_stop_large_and_stepwise_advancement_have_identical_authoritative_outcomes() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = harvest_fixture(&catalog, &["plot-1", "plot-2"]);
    advance_to(&mut farm, &catalog, |work| {
        matches!(work, ResidentTaskStepWork::HarvestCrop { .. })
    });
    let id = task_id(&farm);
    stop_accepted(&mut farm, &catalog, &id);
    let mut delayed = reload(&farm);
    finish(&mut farm, &catalog);
    let end = farm.last_update_ms + 1_000_000;
    apply_elapsed(&mut farm, &catalog, end);
    apply_elapsed(&mut delayed, &catalog, end);
    assert_eq!(state(&delayed), state(&farm));
}

#[test]
fn stop_pending_oven_start_returns_real_picked_ingredients_and_removes_only_pending_job() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    // A valid unlocked catalog state; no job, input movement or production is fabricated.
    farm.xp = 4;
    farm.level = 2;
    farm.resident_locations
        .insert("woman".into(), Tile::new(1, 1));
    accepted(
        &mut farm,
        &catalog,
        FarmCommand::BuyFarmhouseUpgrade {
            upgrade_kind: FarmhouseUpgradeKind::Oven,
        },
    );
    accepted(
        &mut farm,
        &catalog,
        FarmCommand::QueueOvenRecipe {
            recipe_id: "bread".into(),
        },
    );
    advance_to(&mut farm, &catalog, |work| {
        matches!(work, ResidentTaskStepWork::PickupItems { .. })
    });
    let id = task_id(&farm);
    stop_accepted(&mut farm, &catalog, &id);
    finish(&mut farm, &catalog);
    assert!(
        farm.oven.queue.is_empty(),
        "cancelled pending job must not remain phantom reserved work"
    );
    assert_eq!(inventory_quantity(&farm, "wheat"), 6);
    assert_eq!(inventory_quantity(&farm, "bread"), 0);
    assert_eq!(farm.xp, 4);
}

#[test]
fn stop_active_oven_start_keeps_consumed_ingredients_and_real_autonomous_job() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = 4;
    farm.level = 2;
    accepted(
        &mut farm,
        &catalog,
        FarmCommand::BuyFarmhouseUpgrade {
            upgrade_kind: FarmhouseUpgradeKind::Oven,
        },
    );
    accepted(
        &mut farm,
        &catalog,
        FarmCommand::QueueOvenRecipe {
            recipe_id: "bread".into(),
        },
    );
    advance_to(&mut farm, &catalog, |work| {
        matches!(work, ResidentTaskStepWork::StartOvenRecipe { .. })
    });
    let id = task_id(&farm);
    let job = farm.oven.queue[0].id.clone();
    let started = farm.resident_task_queues["woman"][0].ready_at_ms;
    assert_eq!(farm.resident_inventories["woman"].items["wheat"], 3);
    stop_accepted(&mut farm, &catalog, &id);
    apply_elapsed(&mut farm, &catalog, started);
    finish(&mut farm, &catalog);
    assert_eq!(farm.oven.queue[0].id, job);
    assert_eq!(farm.oven.queue[0].status, OvenJobStatus::Producing);
    assert_eq!(farm.oven.queue[0].started_at_ms, started);
    assert_eq!(
        inventory_quantity(&farm, "wheat"),
        3,
        "active recipe consumption must not be refunded"
    );
    let ready = farm.oven.queue[0].ready_at_ms;
    apply_elapsed(&mut farm, &catalog, ready);
    assert_eq!(farm.oven.queue[0].id, job);
    assert_eq!(
        inventory_quantity(&farm, "bread"),
        0,
        "automatic job readiness is not physical collection/deposit"
    );
    accepted(&mut farm, &catalog, FarmCommand::CollectOvenJob);
    finish(&mut farm, &catalog);
    assert_eq!(inventory_quantity(&farm, "bread"), 1);
    assert!(farm.oven.queue.is_empty());
}

#[test]
fn exceptional_saved_capacity_fault_blocks_stopped_cleanup_without_loss_then_recovers() {
    let catalog = CatalogDocument::default_catalog();
    let mut real = harvest_fixture(&catalog, &["plot-1"]);
    advance_to(&mut real, &catalog, |work| {
        matches!(work, ResidentTaskStepWork::DepositItems { .. })
    });
    assert_eq!(real.resident_inventories["woman"].items["wheat"], 2);
    let id = task_id(&real);
    let mut saved = state(&real);
    // Explicit exceptional saved-input fault: real carry/queue/outcomes unchanged.
    saved["silo_capacity"] = json!(inventory_quantity(&real, "wheat"));
    let mut farm: FarmState = serde_json::from_value(saved)
        .expect("characterized baseline accepts this isolated capacity fault");
    stop_accepted(&mut farm, &catalog, &id);
    let at = farm.resident_task_queues["woman"][0].ready_at_ms;
    apply_elapsed(&mut farm, &catalog, at);
    let view = farm_view(&farm, &catalog);
    let blocked = view.resident_work["woman"]
        .block
        .as_ref()
        .expect("full cleanup storage must be visible");
    let reason = format!("{} {}", blocked.reason, blocked.message).to_lowercase();
    assert!(
        reason.contains("capacity") || reason.contains("storage") || reason.contains("full"),
        "unrelated failure: {reason}"
    );
    assert_eq!(farm.resident_inventories["woman"].items["wheat"], 2);
    assert_eq!(inventory_quantity(&farm, "wheat"), 5);
    conserved(&farm);
    // Repair ONLY the same exceptional saved field; no synthetic executor outcome.
    let mut repaired = state(&farm);
    repaired["silo_capacity"] = json!(real.silo_capacity);
    farm = serde_json::from_value(repaired).unwrap();
    finish(&mut farm, &catalog);
    assert_eq!(inventory_quantity(&farm, "wheat"), 7);
    assert!(farm.blocked_resident_tasks.is_empty());
}

#[test]
fn exceptional_saved_cleanup_target_fault_is_visible_and_recovers_without_remote_deposit() {
    let catalog = CatalogDocument::default_catalog();
    let mut real = harvest_fixture(&catalog, &["plot-1"]);
    advance_to(&mut real, &catalog, |work| {
        matches!(work, ResidentTaskStepWork::DepositItems { .. })
    });
    let id = task_id(&real);
    let mut saved = state(&real);
    // Target moved outside the actual Farm in saved input, not a permitted player move.
    saved["silo_tile"] = json!({"x": -100, "y": -100});
    let mut farm: FarmState = serde_json::from_value(saved)
        .expect("characterized baseline accepts this isolated reachability fault");
    stop_accepted(&mut farm, &catalog, &id);
    let at = farm.resident_task_queues["woman"][0].ready_at_ms;
    apply_elapsed(&mut farm, &catalog, at);
    let view = farm_view(&farm, &catalog);
    let blocked = view.resident_work["woman"]
        .block
        .as_ref()
        .expect("unreachable cleanup must remain visible");
    let reason = format!("{} {}", blocked.reason, blocked.message).to_lowercase();
    assert!(
        reason.contains("path") || reason.contains("reach") || reason.contains("target"),
        "unrelated failure: {reason}"
    );
    assert_eq!(farm.resident_inventories["woman"].items["wheat"], 2);
    assert_eq!(inventory_quantity(&farm, "wheat"), 5);
    conserved(&farm);
    let mut repaired = state(&farm);
    repaired["silo_tile"] = serde_json::to_value(&real.silo_tile).unwrap();
    farm = serde_json::from_value(repaired).unwrap();
    finish(&mut farm, &catalog);
    assert_eq!(inventory_quantity(&farm, "wheat"), 7);
}
