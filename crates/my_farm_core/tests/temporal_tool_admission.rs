//! Independent acceptance for the manual-task prerequisite of #171/#172.
use my_farm_core::{
    CatalogDocument, FarmCommand, FarmState, PlantedCrop, ResidentTask, ResidentTaskStepWork,
    ToolKind, apply_command, apply_elapsed, crop_storage_used, farm_view, inventory_quantity,
    new_farm,
};

fn accepted(farm: &mut FarmState, catalog: &CatalogDocument, command: FarmCommand) {
    let outcome = apply_command(farm, catalog, command, 0);
    assert!(outcome.accepted, "Command rejected: {:?}", outcome.error);
}
fn select(farm: &mut FarmState, catalog: &CatalogDocument, resident: &str) {
    accepted(
        farm,
        catalog,
        FarmCommand::SelectResident {
            resident_id: resident.to_owned(),
        },
    );
}
fn plant(farm: &mut FarmState, catalog: &CatalogDocument, plot: &str) {
    accepted(
        farm,
        catalog,
        FarmCommand::PlantCrop {
            plot_id: plot.to_owned(),
            crop_id: "wheat".to_owned(),
        },
    );
}
fn state(farm: &FarmState) -> serde_json::Value {
    serde_json::to_value(farm).unwrap()
}
fn restored(farm: &FarmState) -> FarmState {
    serde_json::from_str(&serde_json::to_string(farm).unwrap()).unwrap()
}
fn conserved(farm: &FarmState, tool: ToolKind) {
    let source = farm.farmhouse_tool_stock.get(&tool).copied().unwrap_or(0);
    let carried: u32 = farm
        .resident_inventories
        .values()
        .map(|inventory| inventory.tools.get(&tool).copied().unwrap_or(0))
        .sum();
    assert_eq!(source + carried, 1, "Tool duplicated or lost");
    assert!(
        farm.resident_inventories
            .values()
            .filter(|inventory| inventory.tools.get(&tool).copied().unwrap_or(0) > 0)
            .count()
            <= 1
    );
}
fn finish(farm: &mut FarmState, catalog: &CatalogDocument, tool: ToolKind) {
    for time in (100..=180_000).step_by(100) {
        apply_elapsed(farm, catalog, time);
        conserved(farm, tool);
        assert!(
            farm.blocked_resident_tasks.is_empty(),
            "Expected accepted work became ordinary blocked recovery: {:?}",
            farm.blocked_resident_tasks
        );
        assert!(crop_storage_used(farm, catalog) <= farm.silo_capacity);
        if farm.resident_task_queues.values().all(Vec::is_empty) {
            assert!(
                farm.resident_inventories
                    .values()
                    .all(|inventory| inventory.tools.is_empty() && inventory.items.is_empty())
            );
            return;
        }
    }
    panic!("Small manual fixture failed to finish within bounded Farm time");
}
fn step_completion(task: &ResidentTask, pickup: bool) -> i64 {
    let mut time = task.ready_at_ms;
    for (index, step) in task.steps.iter().enumerate() {
        if index > 0 {
            time += step.duration_ms;
        }
        if matches!(&step.work, ResidentTaskStepWork::PickupTools { .. }) && pickup
            || matches!(&step.work, ResidentTaskStepWork::ReturnTools { .. }) && !pickup
        {
            return time;
        }
    }
    panic!("Physical Tool custody step missing");
}
fn shared_planting(catalog: &CatalogDocument) -> FarmState {
    let mut farm = new_farm(0, catalog);
    assert_eq!(farm.farmhouse_tool_stock[&ToolKind::Hoe], 1);
    plant(&mut farm, catalog, "plot-1");
    plant(&mut farm, catalog, "plot-2");
    let earlier = farm.resident_task_queues["woman"].clone();
    select(&mut farm, catalog, "man");
    plant(&mut farm, catalog, "plot-3");
    assert_eq!(
        farm.resident_task_queues["woman"], earlier,
        "New Resident task displaced earlier commitment"
    );
    assert_eq!(farm.resident_task_queues["man"].len(), 1);
    let release = step_completion(farm.resident_task_queues["woman"].last().unwrap(), false);
    let checkout = step_completion(&farm.resident_task_queues["man"][0], true);
    assert!(
        checkout >= release,
        "Future checkout overlaps earlier physical custody"
    );
    conserved(&farm, ToolKind::Hoe);
    farm
}
#[test]
fn two_residents_commit_one_hoe_in_future_intervals_without_changing_fifo() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = shared_planting(&catalog);
    let wheat_before = inventory_quantity(&new_farm(0, &catalog), "wheat");
    assert!(
        !farm_view(&farm, &catalog).resident_work["man"]
            .queue
            .is_empty()
    );
    finish(&mut farm, &catalog, ToolKind::Hoe);
    assert!(farm.field_plots[..3].iter().all(|plot| plot.crop.is_some()));
    assert_eq!(inventory_quantity(&farm, "wheat"), wheat_before - 3);
    assert_eq!(farm.farmhouse_tool_stock[&ToolKind::Hoe], 1);
}
#[test]
fn saved_future_tool_commitments_resume_identically_mid_checkout() {
    let catalog = CatalogDocument::default_catalog();
    let mut direct = shared_planting(&catalog);
    apply_elapsed(&mut direct, &catalog, 500);
    let mut reload = restored(&direct);
    assert_eq!(state(&direct), state(&reload));
    for time in (600..=180_000).step_by(100) {
        apply_elapsed(&mut direct, &catalog, time);
        apply_elapsed(&mut reload, &catalog, time);
        conserved(&direct, ToolKind::Hoe);
        conserved(&reload, ToolKind::Hoe);
        assert_eq!(state(&direct), state(&reload), "Reload diverged at {time}");
        if direct.resident_task_queues.values().all(Vec::is_empty) {
            return;
        }
    }
    panic!("Restored manual Tool plan did not finish");
}
#[test]
fn delayed_actual_checkout_slides_later_work_without_stealing_or_blocking() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = shared_planting(&catalog);
    // Controlled authoritative saved-state fixture: the active step now completes later.
    // No mock executor; all subsequent transfers/steps still use apply_elapsed.
    farm.resident_task_queues.get_mut("woman").unwrap()[0].ready_at_ms += 20_000;
    let delayed = restored(&farm);
    assert_eq!(state(&farm), state(&delayed));
    for time in (100..=20_000).step_by(100) {
        apply_elapsed(&mut farm, &catalog, time);
        conserved(&farm, ToolKind::Hoe);
        assert!(
            farm.resident_inventories["man"].tools.is_empty(),
            "Later Resident stole still-held Tool"
        );
        assert!(
            farm.blocked_resident_tasks.is_empty(),
            "Timing delay became ordinary blocked task"
        );
    }
    // Continue monotonically after the imposed delay.
    for time in (20_100..=200_000).step_by(100) {
        apply_elapsed(&mut farm, &catalog, time);
        conserved(&farm, ToolKind::Hoe);
        assert!(farm.blocked_resident_tasks.is_empty());
        if farm.resident_task_queues.values().all(Vec::is_empty) {
            assert!(farm.field_plots[..3].iter().all(|plot| plot.crop.is_some()));
            return;
        }
    }
    panic!("Delayed admitted plan failed to recover");
}
#[test]
fn future_harvest_capacity_cannot_be_stolen_by_another_resident() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    for plot in farm.field_plots.iter_mut().take(2) {
        plot.crop = Some(PlantedCrop {
            item_id: "wheat".to_owned(),
            planted_at_ms: 0,
            ready_at_ms: 0,
        });
    }
    farm.silo_capacity = crop_storage_used(&farm, &catalog) + 2;
    accepted(
        &mut farm,
        &catalog,
        FarmCommand::HarvestCrop {
            plot_id: "plot-1".to_owned(),
        },
    );
    select(&mut farm, &catalog, "man");
    let before = state(&farm);
    let rejection = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::HarvestCrop {
            plot_id: "plot-2".to_owned(),
        },
        0,
    );
    assert!(!rejection.accepted);
    assert_eq!(rejection.error.unwrap().message, "storage is full");
    assert_eq!(
        state(&farm),
        before,
        "Rejected admission partially mutated Farm"
    );
    finish(&mut farm, &catalog, ToolKind::Sickle);
    assert!(farm.field_plots[0].crop.is_none());
    assert!(farm.field_plots[1].crop.is_some());
    assert_eq!(crop_storage_used(&farm, &catalog), farm.silo_capacity);
}
#[test]
fn unavailable_current_crop_input_rejects_without_partial_future_tool_claim() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.inventory.insert("wheat".to_owned(), 1);
    plant(&mut farm, &catalog, "plot-1");
    select(&mut farm, &catalog, "man");
    let before = state(&farm);
    let rejection = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlantCrop {
            plot_id: "plot-2".to_owned(),
            crop_id: "wheat".to_owned(),
        },
        0,
    );
    assert!(!rejection.accepted);
    assert_eq!(state(&farm), before);
    assert!(farm.resident_task_queues["man"].is_empty());
    conserved(&farm, ToolKind::Hoe);
}

#[test]
fn shared_tool_plan_large_elapsed_matches_small_elapsed() {
    let catalog = CatalogDocument::default_catalog();
    let mut large = shared_planting(&catalog);
    let mut small = restored(&large);
    apply_elapsed(&mut large, &catalog, 180_000);
    for time in (100..=180_000).step_by(100) {
        apply_elapsed(&mut small, &catalog, time);
        conserved(&small, ToolKind::Hoe);
        assert!(small.blocked_resident_tasks.is_empty());
    }
    conserved(&large, ToolKind::Hoe);
    assert!(large.blocked_resident_tasks.is_empty());
    assert!(large.resident_task_queues.values().all(Vec::is_empty));
    assert_eq!(state(&large), state(&small));
}

#[test]
fn two_residents_share_sickle_and_deposit_each_real_harvest_once() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    for plot in farm.field_plots.iter_mut().take(2) {
        plot.crop = Some(PlantedCrop {
            item_id: "wheat".to_owned(),
            planted_at_ms: 0,
            ready_at_ms: 0,
        });
    }
    let wheat_before = inventory_quantity(&farm, "wheat");
    farm.silo_capacity = crop_storage_used(&farm, &catalog) + 4;
    accepted(
        &mut farm,
        &catalog,
        FarmCommand::HarvestCrop {
            plot_id: "plot-1".to_owned(),
        },
    );
    let earlier = farm.resident_task_queues["woman"].clone();
    select(&mut farm, &catalog, "man");
    accepted(
        &mut farm,
        &catalog,
        FarmCommand::HarvestCrop {
            plot_id: "plot-2".to_owned(),
        },
    );
    assert_eq!(farm.resident_task_queues["woman"], earlier);
    finish(&mut farm, &catalog, ToolKind::Sickle);
    assert!(farm.field_plots[..2].iter().all(|plot| plot.crop.is_none()));
    assert_eq!(inventory_quantity(&farm, "wheat"), wheat_before + 4);
    let settled = state(&farm);
    let settled_at = farm.last_update_ms;
    apply_elapsed(&mut farm, &catalog, settled_at);
    assert_eq!(
        state(&farm),
        settled,
        "Replayed elapsed deposit duplicated output"
    );
}

#[test]
fn reloading_an_actual_checked_out_tool_preserves_physical_stock() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    plant(&mut farm, &catalog, "plot-1");
    // The starting Resident can complete the adjacent tool pickup immediately.
    // This command still uses the real physical transfer, not a seeded result.
    apply_elapsed(&mut farm, &catalog, 0);
    assert_eq!(farm.resident_inventories["woman"].tools[&ToolKind::Hoe], 1);
    conserved(&farm, ToolKind::Hoe);
    let mut loaded = restored(&farm);
    conserved(&loaded, ToolKind::Hoe);
    assert_eq!(loaded.farmhouse_tool_stock, farm.farmhouse_tool_stock);
    assert_eq!(loaded.resident_inventories, farm.resident_inventories);
    assert_eq!(loaded.resident_task_queues, farm.resident_task_queues);
    assert_eq!(loaded.last_update_ms, farm.last_update_ms);
    finish(&mut loaded, &catalog, ToolKind::Hoe);
}

#[test]
fn appending_work_cannot_remove_a_return_promised_to_another_resident() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = shared_planting(&catalog);
    let earlier_woman = farm.resident_task_queues["woman"].clone();
    let earlier_man = farm.resident_task_queues["man"].clone();
    let promised_release = step_completion(earlier_woman.last().unwrap(), false);
    let promised_checkout = step_completion(&earlier_man[0], true);
    assert!(promised_checkout >= promised_release);

    select(&mut farm, &catalog, "woman");
    plant(&mut farm, &catalog, "plot-4");
    assert_eq!(farm.resident_task_queues["man"], earlier_man);
    assert_eq!(
        &farm.resident_task_queues["woman"][..earlier_woman.len()],
        earlier_woman.as_slice(),
        "Appending work changed the physical return backing an accepted checkout"
    );
    let later_checkout = step_completion(farm.resident_task_queues["woman"].last().unwrap(), true);
    let man_release = step_completion(earlier_man.last().unwrap(), false);
    assert!(later_checkout >= man_release);
    finish(&mut farm, &catalog, ToolKind::Hoe);
    assert!(farm.field_plots[..4].iter().all(|plot| plot.crop.is_some()));
    assert_eq!(
        inventory_quantity(&farm, "wheat"),
        inventory_quantity(&new_farm(0, &catalog), "wheat") - 4
    );
}

#[test]
fn legacy_missing_whole_tool_stock_retains_initial_defaults() {
    let catalog = CatalogDocument::default_catalog();
    let fresh = new_farm(0, &catalog);
    let mut legacy = state(&fresh);
    assert!(
        legacy
            .as_object_mut()
            .unwrap()
            .remove("farmhouse_tool_stock")
            .is_some()
    );
    let loaded: FarmState = serde_json::from_value(legacy).unwrap();
    assert_eq!(loaded.farmhouse_tool_stock, fresh.farmhouse_tool_stock);
    assert_eq!(loaded.resident_inventories, fresh.resident_inventories);
    conserved(&loaded, ToolKind::Hoe);
    conserved(&loaded, ToolKind::Sickle);
}

#[test]
fn a_blocked_holder_cannot_back_new_checkout_or_stop_unrelated_tool_work() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    plant(&mut farm, &catalog, "plot-1");
    assert_eq!(farm.resident_inventories["woman"].tools[&ToolKind::Hoe], 1);
    // Saved-state fault: the planting input disappears after admission. The
    // actual executor, not a fabricated blocked read model, detects the failure.
    farm.inventory.insert("wheat".to_owned(), 0);
    apply_elapsed(&mut farm, &catalog, 180_000);
    assert!(farm.blocked_resident_tasks.contains_key("woman"));
    assert_eq!(farm.resident_inventories["woman"].tools[&ToolKind::Hoe], 1);
    conserved(&farm, ToolKind::Hoe);
    // Corn is separately available: rejection cannot be explained by the
    // missing Wheat that blocks the first Resident's accepted task.
    assert!(inventory_quantity(&farm, "corn") > 0);
    let now = farm.last_update_ms;
    assert!(
        apply_command(
            &mut farm,
            &catalog,
            FarmCommand::SelectResident {
                resident_id: "man".to_owned(),
            },
            now
        )
        .accepted
    );
    assert!(farm.blocked_resident_tasks.contains_key("woman"));
    assert_eq!(farm.resident_inventories["woman"].tools[&ToolKind::Hoe], 1);
    let before = state(&farm);
    let rejected = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlantCrop {
            plot_id: "plot-3".to_owned(),
            crop_id: "corn".to_owned(),
        },
        now,
    );
    assert!(
        !rejected.accepted,
        "Blocked holder has no backed return time"
    );
    assert_eq!(state(&farm), before, "Rejected checkout mutated prior work");

    farm.field_plots[1].crop = Some(PlantedCrop {
        item_id: "wheat".to_owned(),
        planted_at_ms: 0,
        ready_at_ms: 0,
    });
    assert!(
        apply_command(
            &mut farm,
            &catalog,
            FarmCommand::HarvestCrop {
                plot_id: "plot-2".to_owned(),
            },
            now
        )
        .accepted
    );
    for time in (now + 100..=now + 180_000).step_by(100) {
        apply_elapsed(&mut farm, &catalog, time);
        conserved(&farm, ToolKind::Hoe);
        conserved(&farm, ToolKind::Sickle);
        assert!(!farm.blocked_resident_tasks.contains_key("man"));
        if farm.resident_task_queues["man"].is_empty() {
            assert!(farm.field_plots[1].crop.is_none());
            return;
        }
    }
    panic!("Blocked Hoe holder prevented unrelated Sickle work");
}

#[test]
fn two_physical_hoes_allow_overlapping_resident_custody_without_duplication() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    // Authoritative input fixture with two real copies; no default stock rebalance.
    farm.farmhouse_tool_stock.insert(ToolKind::Hoe, 2);
    plant(&mut farm, &catalog, "plot-1");
    let first_return = step_completion(farm.resident_task_queues["woman"].last().unwrap(), false);
    select(&mut farm, &catalog, "man");
    plant(&mut farm, &catalog, "plot-2");
    // Adjacent pickup completes inside the real command, before the first
    // Resident's return. Observe physical custody rather than a removed step.
    assert!(first_return > farm.last_update_ms);
    assert_eq!(farm.resident_inventories["woman"].tools[&ToolKind::Hoe], 1);
    assert_eq!(farm.resident_inventories["man"].tools[&ToolKind::Hoe], 1);
    for time in (0..=180_000).step_by(100) {
        apply_elapsed(&mut farm, &catalog, time);
        let stored = farm
            .farmhouse_tool_stock
            .get(&ToolKind::Hoe)
            .copied()
            .unwrap_or(0);
        let carried: u32 = farm
            .resident_inventories
            .values()
            .map(|inventory| inventory.tools.get(&ToolKind::Hoe).copied().unwrap_or(0))
            .sum();
        assert_eq!(stored + carried, 2);
        assert!(farm.blocked_resident_tasks.is_empty());
        if farm.resident_task_queues.values().all(Vec::is_empty) {
            assert!(farm.field_plots[..2].iter().all(|plot| plot.crop.is_some()));
            assert_eq!(stored, 2);
            assert_eq!(carried, 0);
            return;
        }
    }
    panic!("Two-copy fixture failed to finish");
}

#[test]
fn unrepresentable_remaining_tool_timeline_rejects_new_work_atomically() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    plant(&mut farm, &catalog, "plot-1");
    // Saved-state fault: the next completion fits i64, but adding the actual
    // remaining physical steps cannot produce a representable return deadline.
    farm.resident_task_queues.get_mut("woman").unwrap()[0].ready_at_ms = i64::MAX - 1;
    select(&mut farm, &catalog, "man");
    let before = state(&farm);
    let rejected = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlantCrop {
            plot_id: "plot-2".to_owned(),
            crop_id: "corn".to_owned(),
        },
        0,
    );
    assert!(!rejected.accepted);
    assert_eq!(state(&farm), before);
    conserved(&farm, ToolKind::Hoe);
}

#[test]
fn a_carried_tool_without_a_resident_queue_cannot_back_new_checkout() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    plant(&mut farm, &catalog, "plot-1");
    assert_eq!(farm.resident_inventories["woman"].tools[&ToolKind::Hoe], 1);
    conserved(&farm, ToolKind::Hoe);

    // An accepted saved-state boundary retains physical custody even when its
    // queue entry is absent. Remove only that entry, leaving the actual command's
    // carried inventory and all other serialized fields intact.
    let mut saved = state(&farm);
    assert!(
        saved["resident_task_queues"]
            .as_object_mut()
            .unwrap()
            .remove("woman")
            .is_some()
    );
    let mut farm: FarmState = serde_json::from_value(saved).unwrap();
    assert!(!farm.resident_task_queues.contains_key("woman"));
    assert_eq!(farm.resident_inventories["woman"].tools[&ToolKind::Hoe], 1);
    conserved(&farm, ToolKind::Hoe);
    assert!(inventory_quantity(&farm, "wheat") > 0);
    let now = farm.last_update_ms;
    assert!(
        apply_command(
            &mut farm,
            &catalog,
            FarmCommand::SelectResident {
                resident_id: "man".to_owned(),
            },
            now
        )
        .accepted
    );
    let before = state(&farm);
    let outcome = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::PlantCrop {
            plot_id: "plot-3".to_owned(),
            crop_id: "wheat".to_owned(),
        },
        now,
    );
    assert!(
        !outcome.accepted,
        "Physical holder without a queue has no guaranteed return"
    );
    assert_eq!(
        state(&farm),
        before,
        "Rejected checkout changed the saved Farm"
    );
    assert_eq!(farm.resident_inventories["woman"].tools[&ToolKind::Hoe], 1);
    conserved(&farm, ToolKind::Hoe);
}
