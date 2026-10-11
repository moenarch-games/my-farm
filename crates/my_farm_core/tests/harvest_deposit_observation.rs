//! Independent acceptance of PR #213's first-crop deposit observation repair.
//! Established before production at main e844cc6 / PR head900f6b5. Fixtures
//! provide initial ready crops, never fabricated completed harvest/deposit results.
use my_farm_core::{
    CatalogDocument, FarmCommand, FarmEvent, FarmState, PlantedCrop, ResidentTaskStepWork,
    StorageSourceRef, StructureKind, Tile, apply_command, apply_elapsed, farm_view,
    inventory_quantity, new_farm, update_level,
};

fn command(farm: &mut FarmState, catalog: &CatalogDocument, command: FarmCommand, at: i64) {
    let result = apply_command(farm, catalog, command, at);
    assert!(result.accepted, "{:?}", result.error);
}

fn ready_crop(farm: &mut FarmState) {
    farm.field_plots[0].crop = Some(PlantedCrop {
        item_id: "wheat".into(),
        planted_at_ms: 0,
        ready_at_ms: 0,
    });
}

fn queued_harvest(catalog: &CatalogDocument) -> (FarmState, String, i64) {
    let mut farm = new_farm(0, catalog);
    ready_crop(&mut farm);
    command(
        &mut farm,
        catalog,
        FarmCommand::HarvestCrop {
            plot_id: "plot-1".into(),
        },
        0,
    );
    let task = &farm.resident_task_queues["woman"][0];
    let id = task.id.clone();
    let harvest_at = step_at(&farm, |step| {
        matches!(step, ResidentTaskStepWork::HarvestCrop { .. })
    });
    (farm, id, harvest_at)
}

fn harvested(catalog: &CatalogDocument) -> (FarmState, String, i64) {
    let (mut farm, id, at) = queued_harvest(catalog);
    let events = apply_elapsed(&mut farm, catalog, at);
    assert!(events.iter().any(|event| matches!(event,
        FarmEvent::CropHarvested { crop_id, quantity: 2 } if crop_id == "wheat")));
    assert_eq!(farm.resident_inventories["woman"].items["wheat"], 2);
    assert_eq!(inventory_quantity(&farm, "wheat"), 6);
    (farm, id, at)
}

fn step_at(farm: &FarmState, predicate: impl Fn(&ResidentTaskStepWork) -> bool) -> i64 {
    let task = &farm.resident_task_queues["woman"][0];
    let mut at = task.ready_at_ms;
    for (index, step) in task.steps.iter().enumerate() {
        if index > 0 {
            at += step.duration_ms;
        }
        if predicate(&step.work) {
            return at;
        }
    }
    panic!("required actual task step is absent");
}

fn tail_at(farm: &FarmState) -> i64 {
    let task = farm.resident_task_queues["woman"].last().unwrap();
    task.ready_at_ms
        + task
            .steps
            .iter()
            .skip(1)
            .map(|step| step.duration_ms)
            .sum::<i64>()
}

fn finish(farm: &mut FarmState, catalog: &CatalogDocument) {
    let tail = tail_at(farm);
    apply_elapsed(farm, catalog, tail);
    assert!(farm.resident_task_queues["woman"].is_empty());
}

fn assert_no_receipt(farm: &FarmState, catalog: &CatalogDocument) {
    assert!(farm.resident_last_harvest_deposit.is_empty());
    assert!(
        farm_view(farm, catalog)
            .resident_last_harvest_deposit
            .is_empty()
    );
}

fn assert_cargo_bounded(farm: &FarmState) {
    for (resident, cargo) in &farm.resident_harvest_cargo {
        let mut totals = std::collections::BTreeMap::<&str, u32>::new();
        for origin in cargo {
            assert!(origin.quantity > 0);
            *totals.entry(&origin.crop_id).or_default() += origin.quantity;
        }
        for (crop, tracked) in totals {
            assert!(
                tracked
                    <= farm.resident_inventories[resident]
                        .items
                        .get(crop)
                        .copied()
                        .unwrap_or(0)
            );
        }
        assert!(cargo.len() as u32 <= farm.resident_inventories[resident].item_capacity);
    }
}

#[test]
fn receipt_requires_actual_silo_deposit_and_survives_later_net_spending() {
    let catalog = CatalogDocument::default_catalog();
    let (mut farm, harvest_id, harvest_at) = harvested(&catalog);
    assert_no_receipt(&farm, &catalog);
    assert_cargo_bounded(&farm);
    let deposit_at = step_at(&farm, |step| {
        matches!(
            step,
            ResidentTaskStepWork::DepositItems {
                destination: StorageSourceRef::Silo,
                ..
            }
        )
    });
    apply_elapsed(&mut farm, &catalog, deposit_at - 1);
    assert_no_receipt(&farm, &catalog);
    apply_elapsed(&mut farm, &catalog, deposit_at);
    assert_eq!(inventory_quantity(&farm, "wheat"), 8);
    let receipt = farm.resident_last_harvest_deposit["woman"].clone();
    assert_eq!(receipt.task_id, harvest_id);
    assert_eq!(receipt.crop_id, "wheat");
    assert_eq!(receipt.completed_at_ms, deposit_at);
    assert!(receipt.completed_at_ms > harvest_at);
    assert_eq!(
        farm_view(&farm, &catalog).resident_last_harvest_deposit["woman"],
        receipt
    );
    command(
        &mut farm,
        &catalog,
        FarmCommand::SweepPlant {
            crop_id: "wheat".into(),
            plot_ids: (1..=5).map(|i| format!("plot-{i}")).collect(),
        },
        deposit_at,
    );
    finish(&mut farm, &catalog);
    assert_eq!(inventory_quantity(&farm, "wheat"), 3);
    assert_eq!(farm.resident_last_harvest_deposit["woman"], receipt);
    assert_eq!(
        farm_view(&farm, &catalog).resident_last_harvest_deposit["woman"],
        receipt
    );
    let json = serde_json::to_value(farm_view(&farm, &catalog)).unwrap();
    assert!(
        json.get("resident_harvest_cargo").is_none(),
        "internal cargo is not another client authority"
    );
}

#[test]
fn cleanup_stripping_and_direct_carried_consumption_never_claim_deposit() {
    let catalog = CatalogDocument::default_catalog();
    let (mut farm, harvest_id, at) = harvested(&catalog);
    command(
        &mut farm,
        &catalog,
        FarmCommand::SweepPlant {
            crop_id: "wheat".into(),
            plot_ids: vec!["plot-1".into(), "plot-2".into()],
        },
        at,
    );
    assert!(
        farm.resident_task_queues["woman"]
            .iter()
            .all(|task| task.id != harvest_id)
    );
    assert_no_receipt(&farm, &catalog);
    finish(&mut farm, &catalog);
    assert_eq!(inventory_quantity(&farm, "wheat"), 6);
    assert!(farm.resident_inventories["woman"].items.is_empty());
    assert!(
        farm.resident_harvest_cargo
            .get("woman")
            .is_none_or(Vec::is_empty)
    );
    assert_no_receipt(&farm, &catalog);
    let market_at = farm.last_update_ms;
    command(
        &mut farm,
        &catalog,
        FarmCommand::BuyMarketItem {
            item_id: "wheat".into(),
            quantity: 2,
        },
        market_at,
    );
    assert_eq!(inventory_quantity(&farm, "wheat"), 8);
    assert_no_receipt(&farm, &catalog);
}

#[test]
fn deferred_cleanup_deposit_preserves_original_harvest_identity() {
    let catalog = CatalogDocument::default_catalog();
    let (mut farm, harvest_id, at) = harvested(&catalog);
    command(
        &mut farm,
        &catalog,
        FarmCommand::PlantCrop {
            plot_id: "plot-1".into(),
            crop_id: "wheat".into(),
        },
        at,
    );
    assert!(
        farm.resident_task_queues["woman"]
            .iter()
            .all(|task| task.id != harvest_id)
    );
    let plant_at = step_at(&farm, |step| {
        matches!(step, ResidentTaskStepWork::PlantCrop { .. })
    });
    apply_elapsed(&mut farm, &catalog, plant_at);
    assert_no_receipt(&farm, &catalog);
    assert_eq!(farm.resident_inventories["woman"].items["wheat"], 1);
    assert_eq!(
        farm.resident_harvest_cargo["woman"]
            .iter()
            .map(|cargo| cargo.quantity)
            .sum::<u32>(),
        1
    );
    assert_cargo_bounded(&farm);
    let deposit_at = step_at(&farm, |step| {
        matches!(
            step,
            ResidentTaskStepWork::DepositItems {
                destination: StorageSourceRef::Silo,
                ..
            }
        )
    });
    finish(&mut farm, &catalog);
    assert_eq!(inventory_quantity(&farm, "wheat"), 7);
    let receipt = &farm.resident_last_harvest_deposit["woman"];
    assert_eq!(receipt.task_id, harvest_id);
    assert_eq!(receipt.crop_id, "wheat");
    assert_eq!(receipt.completed_at_ms, deposit_at);
    assert!(
        farm.resident_harvest_cargo
            .get("woman")
            .is_none_or(Vec::is_empty)
    );
}

#[test]
fn failed_deposit_does_not_create_receipt_or_consume_origin() {
    let catalog = CatalogDocument::default_catalog();
    let (mut farm, _, _) = harvested(&catalog);
    let deposit_at = step_at(&farm, |step| {
        matches!(step, ResidentTaskStepWork::DepositItems { .. })
    });
    // A stale/edited saved execution plan asks for more than physical carry.
    // The real executor must fail; this fixture supplies no completion outcome.
    for step in &mut farm.resident_task_queues.get_mut("woman").unwrap()[0].steps {
        if let ResidentTaskStepWork::DepositItems { items, .. } = &mut step.work {
            items[0].quantity = 3;
        }
    }
    let pending = farm.resident_harvest_cargo.clone();
    apply_elapsed(&mut farm, &catalog, deposit_at);
    assert_eq!(
        farm.blocked_resident_tasks["woman"].reason,
        "missing_carried_items"
    );
    assert_eq!(inventory_quantity(&farm, "wheat"), 6);
    assert_eq!(farm.resident_inventories["woman"].items["wheat"], 2);
    assert_eq!(farm.resident_harvest_cargo, pending);
    assert_no_receipt(&farm, &catalog);
}

#[test]
fn pending_cargo_and_completed_receipt_round_trip_without_reconstructing_history() {
    let catalog = CatalogDocument::default_catalog();
    let (farm, harvest_id, _) = harvested(&catalog);
    let mut loaded: FarmState =
        serde_json::from_str(&serde_json::to_string(&farm).unwrap()).unwrap();
    assert_eq!(loaded, farm);
    assert_no_receipt(&loaded, &catalog);
    finish(&mut loaded, &catalog);
    assert_eq!(
        loaded.resident_last_harvest_deposit["woman"].task_id,
        harvest_id
    );
    let saved = serde_json::to_string(&loaded).unwrap();
    let reloaded: FarmState = serde_json::from_str(&saved).unwrap();
    assert_eq!(reloaded, loaded);
    assert_eq!(
        farm_view(&reloaded, &catalog).resident_last_harvest_deposit,
        farm_view(&loaded, &catalog).resident_last_harvest_deposit
    );
}

#[test]
fn legacy_carry_cleanup_market_and_pickup_are_not_harvest_history() {
    let catalog = CatalogDocument::default_catalog();
    let mut legacy = serde_json::to_value(new_farm(0, &catalog)).unwrap();
    legacy
        .as_object_mut()
        .unwrap()
        .remove("resident_harvest_cargo");
    legacy
        .as_object_mut()
        .unwrap()
        .remove("resident_last_harvest_deposit");
    legacy["resident_inventories"]["woman"]["items"] = serde_json::json!({"wheat": 2});
    let mut farm: FarmState = serde_json::from_value(legacy).unwrap();
    assert!(farm.resident_harvest_cargo.is_empty());
    assert_no_receipt(&farm, &catalog);
    apply_elapsed(&mut farm, &catalog, 1);
    finish(&mut farm, &catalog);
    assert_eq!(inventory_quantity(&farm, "wheat"), 8);
    assert_no_receipt(&farm, &catalog);
    let at = farm.last_update_ms;
    command(
        &mut farm,
        &catalog,
        FarmCommand::BuyMarketItem {
            item_id: "wheat".into(),
            quantity: 1,
        },
        at,
    );
    assert_no_receipt(&farm, &catalog);
    command(
        &mut farm,
        &catalog,
        FarmCommand::PlantCrop {
            plot_id: "plot-1".into(),
            crop_id: "wheat".into(),
        },
        at,
    );
    let pickup_at = step_at(&farm, |step| {
        matches!(step, ResidentTaskStepWork::PickupItems { .. })
    });
    apply_elapsed(&mut farm, &catalog, pickup_at);
    assert_eq!(farm.resident_inventories["woman"].items["wheat"], 1);
    assert!(farm.resident_harvest_cargo.is_empty());
    assert_no_receipt(&farm, &catalog);
}

#[test]
fn farm_shop_transfer_consumes_harvest_origin_without_silo_receipt() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    farm.xp = catalog.level_xp[2];
    update_level(&mut farm, &catalog);
    command(
        &mut farm,
        &catalog,
        FarmCommand::BuyStructure {
            structure_kind: StructureKind::FarmShop,
            tile: Tile::new(3, 17),
        },
        0,
    );
    ready_crop(&mut farm);
    command(
        &mut farm,
        &catalog,
        FarmCommand::HarvestCrop {
            plot_id: "plot-1".into(),
        },
        0,
    );
    let harvest_at = step_at(&farm, |step| {
        matches!(step, ResidentTaskStepWork::HarvestCrop { .. })
    });
    apply_elapsed(&mut farm, &catalog, harvest_at);
    command(
        &mut farm,
        &catalog,
        FarmCommand::StockFarmShop {
            item_id: "wheat".into(),
            quantity: 2,
        },
        harvest_at,
    );
    let stock_at = step_at(&farm, |step| {
        matches!(step, ResidentTaskStepWork::DepositShopStock { .. })
    });
    let events = apply_elapsed(&mut farm, &catalog, stock_at);
    assert!(events.iter().any(|event| matches!(event, FarmEvent::FarmShopStocked { item_id, quantity: 2 } if item_id == "wheat")));
    assert!(
        farm.resident_harvest_cargo
            .get("woman")
            .is_none_or(Vec::is_empty)
    );
    assert_no_receipt(&farm, &catalog);
}

#[test]
fn elapsed_chunking_and_replayed_time_preserve_identical_receipt_and_farm() {
    let catalog = CatalogDocument::default_catalog();
    let (mut large, _, _) = queued_harvest(&catalog);
    let mut small = large.clone();
    let end = tail_at(&large);
    apply_elapsed(&mut large, &catalog, end);
    while !small.resident_task_queues["woman"].is_empty() {
        let at = small.resident_task_queues["woman"][0].ready_at_ms;
        apply_elapsed(&mut small, &catalog, at);
        assert_cargo_bounded(&small);
    }
    apply_elapsed(&mut small, &catalog, end);
    assert_eq!(large, small);
    assert_eq!(large.resident_last_harvest_deposit.len(), 1);
    let before = large.clone();
    assert!(apply_elapsed(&mut large, &catalog, end).is_empty());
    assert_eq!(large, before);
}
