//! Independent #225 contract on actual public commands/time/store state.
//! Proposed intent/field names are routine and independently translatable.
#[path = "acceptance/explicit_chain_fixture.rs"]
mod fixture;
use fixture::*;
use my_farm_core::{
    CatalogDocument, FarmCommand, FarmState, OvenJobStatus, ResidentTaskStepWork, apply_command,
    apply_elapsed, inventory_quantity,
};
use serde_json::{Value, json};

fn submit(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    request: Value,
) -> my_farm_core::CommandOutcome {
    let command: FarmCommand = serde_json::from_value(request)
        .expect("public core must admit explicit concrete chains through the existing command authority (#225)");
    let now = farm.last_update_ms;
    apply_command(farm, catalog, command, now)
}
fn stored_chain(id: &str) -> Value {
    json!({"type":"admit_concrete_chain", "chain_id":id, "jobs":[
        {"id":"bake", "resident_id":"woman", "work":{"type":"start_oven_recipe","recipe_id":"bread"},
         "after":[], "inputs":[{"item_id":"wheat","quantity":3,"source":{"type":"stored"}}]},
        {"id":"collect", "resident_id":"man", "work":{"type":"collect_oven_job","producer_id":"bake"},
         "after":["bake"], "inputs":[]}
    ]})
}
fn future_chain(id: &str) -> Value {
    let mut request = stored_chain(id);
    request["jobs"][0]["after"] = json!(["harvest-a", "harvest-b"]);
    request["jobs"][0]["inputs"] = json!([
        {"item_id":"wheat","quantity":2,"source":{"type":"producer_output","job_id":"harvest-a"}},
        {"item_id":"wheat","quantity":1,"source":{"type":"producer_output","job_id":"harvest-b"}}
    ]);
    let jobs = request["jobs"].as_array_mut().unwrap();
    jobs.insert(0,json!({"id":"harvest-b","resident_id":"man","work":{"type":"harvest_crop","plot_id":"plot-2"},"after":[],"inputs":[]}));
    jobs.insert(0,json!({"id":"harvest-a","resident_id":"woman","work":{"type":"harvest_crop","plot_id":"plot-1"},"after":[],"inputs":[]}));
    request
}
fn admit(farm: &mut FarmState, catalog: &CatalogDocument, request: Value) {
    let outcome = submit(farm, catalog, request);
    assert!(
        outcome.accepted,
        "feasible concrete chain rejected: {:?}",
        outcome.error
    );
}
fn reject(farm: &mut FarmState, catalog: &CatalogDocument, request: Value, useful: &[&str]) {
    let before = state(farm);
    let outcome = submit(farm, catalog, request);
    assert!(!outcome.accepted, "infeasible chain partially admitted");
    let reason = outcome
        .error
        .expect("rejection reason")
        .message
        .to_lowercase();
    assert!(
        useful.iter().any(|word| reason.contains(word)),
        "unrelated rejection: {reason}"
    );
    assert_eq!(
        state(farm),
        before,
        "failed admission changed resources/jobs/IDs/older commitments"
    );
    conserved(farm);
}
fn complete(farm: &mut FarmState, catalog: &CatalogDocument) {
    finish_tasks(farm, catalog);
    assert!(
        farm.oven.queue.is_empty(),
        "explicit chain requires no later manual Collect intent"
    );
    assert!(
        farm.resident_inventories
            .values()
            .all(|inventory| inventory.items.is_empty() && inventory.tools.is_empty())
    );
}

#[test]
fn explicit_stored_input_chain_is_committed_through_cross_resident_physical_barn_deposit() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = oven_farm(&catalog);
    let coins = farm.coins;
    admit(&mut farm, &catalog, stored_chain("stored-one"));
    assert_eq!(inventory_quantity(&farm, "bread"), 0);
    assert!(
        farm.resident_task_queues["man"]
            .iter()
            .flat_map(|task| &task.steps)
            .any(|step| matches!(step.work, ResidentTaskStepWork::CollectOvenJob { .. })),
        "collection must be committed before readiness"
    );
    complete(&mut farm, &catalog);
    assert_eq!(inventory_quantity(&farm, "bread"), 1);
    assert_eq!(inventory_quantity(&farm, "wheat"), 3);
    assert_eq!(
        farm.coins, coins,
        "chain admission/execution cannot auto-buy"
    );
}

#[test]
fn backed_cross_resident_harvest_quantities_are_consumed_once_and_not_invented_stock() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = ripe_farm(&catalog);
    sell_stored_wheat(&mut farm, &catalog);
    assert_eq!(inventory_quantity(&farm, "wheat"), 0);
    admit(&mut farm, &catalog, future_chain("future-one"));
    let admitted = state(&farm);
    reject(
        &mut farm,
        &catalog,
        future_chain("future-two"),
        &["reserved", "plot", "quantity", "input", "wheat"],
    );
    assert_eq!(state(&farm), admitted);
    let mut competing = stored_chain("consumer-two");
    competing["jobs"][0]["inputs"] = json!([
        {"item_id":"wheat","quantity":2,"source":{"type":"producer_output","chain_id":"future-one","job_id":"harvest-a"}},
        {"item_id":"wheat","quantity":1,"source":{"type":"producer_output","chain_id":"future-one","job_id":"harvest-b"}}
    ]);
    reject(
        &mut farm,
        &catalog,
        competing,
        &["quantity", "input", "wheat", "reserved"],
    );
    complete(&mut farm, &catalog);
    assert_eq!(inventory_quantity(&farm, "bread"), 1);
    assert_eq!(
        inventory_quantity(&farm, "wheat"),
        1,
        "two real2-Wheat harvests minus3 recipe input"
    );
    assert!(
        farm.field_plots
            .iter()
            .filter(|plot| ["plot-1", "plot-2"].contains(&plot.id.as_str()))
            .all(|plot| plot.crop.is_none())
    );
}

#[test]
fn a_new_atomic_chain_can_include_its_real_planting_growth_and_harvest_producers() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = oven_farm(&catalog);
    let mut request = future_chain("grow-one");
    let jobs = request["jobs"].as_array_mut().unwrap();
    jobs[0]["after"] = json!(["plant-a"]);
    jobs[1]["after"] = json!(["plant-b"]);
    for (id, plot, resident) in [("plant-b", "plot-2", "man"), ("plant-a", "plot-1", "woman")] {
        jobs.insert(0,json!({"id":id,"resident_id":resident,"work":{"type":"plant_crop","plot_id":plot,"crop_id":"wheat"},
            "after":[],"inputs":[{"item_id":"wheat","quantity":1,"source":{"type":"stored"}}]}));
    }
    admit(&mut farm, &catalog, request);
    complete(&mut farm, &catalog);
    assert_eq!(inventory_quantity(&farm, "bread"), 1);
    assert_eq!(
        inventory_quantity(&farm, "wheat"),
        5,
        "six initial seeds minus2 plus4 grown minus3 baked"
    );
}

#[test]
fn final_barn_capacity_failure_rolls_back_entire_real_future_chain() {
    let catalog = CatalogDocument::default_catalog();
    let farm = ripe_farm(&catalog);
    // Controlled accepted save input changes only capacity, not resource outcomes.
    let mut document = state(&farm);
    document["barn_capacity"] = json!(0);
    let mut farm: FarmState =
        serde_json::from_value(document).expect("capacity-zero fixture must load");
    reject(
        &mut farm,
        &catalog,
        future_chain("no-barn"),
        &["barn", "storage", "capacity"],
    );
}

#[test]
fn dangling_cyclic_duplicate_and_overclaimed_producer_bindings_fail_atomically() {
    let catalog = CatalogDocument::default_catalog();
    for label in ["dangling", "cycle", "duplicate", "quantity"] {
        let mut farm = ripe_farm(&catalog);
        sell_stored_wheat(&mut farm, &catalog);
        let mut request = future_chain(label);
        match label {
            "dangling" => {
                request["jobs"][2]["inputs"][0]["source"]["job_id"] = json!("missing-producer")
            }
            "cycle" => request["jobs"][0]["after"] = json!(["collect"]),
            "duplicate" => request["jobs"][1]["id"] = json!("harvest-a"),
            _ => request["jobs"][2]["inputs"][0]["quantity"] = json!(3),
        }
        reject(
            &mut farm,
            &catalog,
            request,
            &[
                "dependency",
                "producer",
                "cycle",
                "duplicate",
                "quantity",
                "input",
            ],
        );
    }
}

#[test]
fn new_chain_preserves_previous_accepted_tasks_and_autonomous_bake_releases_resident() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = oven_farm(&catalog);
    accepted(
        &mut farm,
        &catalog,
        FarmCommand::SelectResident {
            resident_id: "man".into(),
        },
    );
    accepted(
        &mut farm,
        &catalog,
        FarmCommand::PlantCrop {
            plot_id: "plot-3".into(),
            crop_id: "wheat".into(),
        },
    );
    let earlier = farm.resident_task_queues["man"].clone();
    admit(&mut farm, &catalog, stored_chain("release-one"));
    assert_eq!(
        &farm.resident_task_queues["man"][..earlier.len()],
        earlier.as_slice()
    );
    for _ in 0..128 {
        if farm
            .oven
            .queue
            .first()
            .is_some_and(|job| job.status == OvenJobStatus::Producing)
        {
            break;
        }
        let next = next_task(&farm).expect("real loading tasks");
        apply_elapsed(&mut farm, &catalog, next);
    }
    let ready = farm.oven.queue[0].ready_at_ms;
    let baking_at = farm.last_update_ms;
    assert!(baking_at < ready);
    accepted(
        &mut farm,
        &catalog,
        FarmCommand::SelectResident {
            resident_id: "woman".into(),
        },
    );
    accepted(
        &mut farm,
        &catalog,
        FarmCommand::PlantCrop {
            plot_id: "plot-4".into(),
            crop_id: "wheat".into(),
        },
    );
    let planting = farm.resident_task_queues["woman"]
        .iter()
        .find(|task| {
            task.steps
                .iter()
                .any(|step| matches!(step.work, ResidentTaskStepWork::PlantCrop { .. }))
        })
        .expect("unrelated planting admitted during bake");
    assert!(
        planting.started_at_ms < ready,
        "baking cannot hold the loading Resident"
    );
    complete(&mut farm, &catalog);
    assert_eq!(inventory_quantity(&farm, "bread"), 1);
    assert!(
        farm.field_plots
            .iter()
            .find(|plot| plot.id == "plot-4")
            .unwrap()
            .crop
            .is_some()
    );
}

#[test]
fn save_reload_and_large_or_small_advances_preserve_real_committed_chain() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = ripe_farm(&catalog);
    sell_stored_wheat(&mut farm, &catalog);
    admit(&mut farm, &catalog, future_chain("replay-one"));
    let mut split: FarmState = serde_json::from_value(state(&farm)).unwrap();
    complete(&mut split, &catalog);
    let end = split.last_update_ms;
    let mut whole: FarmState = serde_json::from_value(state(&farm)).unwrap();
    apply_elapsed(&mut whole, &catalog, end);
    assert_eq!(state(&whole), state(&split));
    let before = state(&whole);
    apply_elapsed(&mut whole, &catalog, end);
    assert_eq!(state(&whole), before);
    let restored: FarmState = serde_json::from_value(state(&whole)).unwrap();
    assert_eq!(state(&restored), before);
}

#[test]
fn actual_late_upstream_work_moves_dependent_execution_without_phantom_bread() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = ripe_farm(&catalog);
    sell_stored_wheat(&mut farm, &catalog);
    admit(&mut farm, &catalog, future_chain("delay-one"));
    let mut saved = state(&farm);
    // Documented deadline fault of actual accepted work, not a fake delay command.
    let deadline = saved["resident_task_queues"]["woman"][0]["ready_at_ms"]
        .as_i64()
        .unwrap();
    saved["resident_task_queues"]["woman"][0]["ready_at_ms"] = json!(deadline + 10000);
    let mut delayed: FarmState = serde_json::from_value(saved).unwrap();
    apply_elapsed(&mut delayed, &catalog, deadline);
    assert_eq!(inventory_quantity(&delayed, "bread"), 0);
    assert!(
        delayed.blocked_resident_tasks.is_empty(),
        "planned upstream delay is not ordinary blocked work"
    );
    complete(&mut delayed, &catalog);
    assert_eq!(inventory_quantity(&delayed, "bread"), 1);
    assert_eq!(inventory_quantity(&delayed, "wheat"), 1);
}

#[test]
fn stopping_a_needed_producer_preserves_accepted_consumer_or_rejects_atomically() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = ripe_farm(&catalog);
    sell_stored_wheat(&mut farm, &catalog);
    admit(&mut farm, &catalog, future_chain("stop-one"));
    let task = farm.resident_task_queues["woman"][0].id.clone();
    let before = state(&farm);
    let now = farm.last_update_ms;
    let outcome = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::CancelResidentTask {
            resident_id: "woman".into(),
            task_id: task,
        },
        now,
    );
    assert!(
        !outcome.accepted,
        "individual producer cancellation cannot silently strand its precommitted Bread consumer"
    );
    assert!(
        outcome
            .error
            .unwrap()
            .message
            .to_lowercase()
            .contains("depend")
    );
    assert_eq!(state(&farm), before);
    complete(&mut farm, &catalog);
    assert_eq!(inventory_quantity(&farm, "bread"), 1);
}

#[test]
fn accepted_recipe_terms_survive_catalog_change_while_new_requests_use_new_terms() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = oven_farm(&catalog);
    admit(&mut farm, &catalog, stored_chain("terms-one"));
    let mut reference = farm.clone();
    complete(&mut reference, &catalog);
    let mut changed = catalog.clone();
    let recipe = changed
        .recipes
        .iter_mut()
        .find(|recipe| recipe.id == "bread")
        .unwrap();
    recipe.inputs[0].quantity = 7;
    recipe.outputs[0].quantity = 2;
    recipe.reference_seconds *= 2;
    let mut restored: FarmState = serde_json::from_value(state(&farm)).unwrap();
    complete(&mut restored, &changed);
    assert_eq!(
        state(&restored),
        state(&reference),
        "later balance edits cannot rewrite accepted job meaning"
    );
    let mut fresh = oven_farm(&changed);
    reject(
        &mut fresh,
        &changed,
        stored_chain("terms-new"),
        &["quantity", "input", "wheat"],
    );
}

#[test]
fn intermediate_silo_and_final_barn_claims_cannot_be_bypassed_or_double_booked() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = ripe_farm(&catalog);
    sell_stored_wheat(&mut farm, &catalog);
    let mut saved = state(&farm);
    saved["silo_capacity"] = json!(0);
    let mut no_silo: FarmState = serde_json::from_value(saved).unwrap();
    reject(
        &mut no_silo,
        &catalog,
        future_chain("no-silo"),
        &["silo", "storage", "capacity"],
    );
    let farm = oven_farm(&catalog);
    let mut saved = state(&farm);
    saved["barn_capacity"] = json!(1);
    let mut one_barn: FarmState = serde_json::from_value(saved).unwrap();
    admit(&mut one_barn, &catalog, stored_chain("barn-one"));
    reject(
        &mut one_barn,
        &catalog,
        stored_chain("barn-two"),
        &["barn", "storage", "capacity"],
    );
    complete(&mut one_barn, &catalog);
    assert_eq!(inventory_quantity(&one_barn, "bread"), 1);
}

#[test]
fn duplicate_explicit_chain_identity_cannot_add_jobs_or_reservations() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = oven_farm(&catalog);
    let request = stored_chain("identity-one");
    admit(&mut farm, &catalog, request.clone());
    let before = state(&farm);
    let outcome = submit(&mut farm, &catalog, request);
    // Existing command-outcome transport exactly-once is not claimed: either
    // harmless idempotent acceptance or useful duplicate rejection is permitted.
    if !outcome.accepted {
        let reason = outcome.error.unwrap().message.to_lowercase();
        assert!(
            reason.contains("duplicate") || reason.contains("already"),
            "{reason}"
        );
    }
    assert_eq!(state(&farm), before);
    complete(&mut farm, &catalog);
    assert_eq!(inventory_quantity(&farm, "bread"), 1);
}

fn advance_until(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    predicate: impl Fn(&FarmState) -> bool,
) {
    for _ in 0..256 {
        conserved(farm);
        assert!(farm.blocked_resident_tasks.is_empty());
        if predicate(farm) {
            return;
        }
        let next = next_task(farm).expect("predicate must be reached by real committed work");
        apply_elapsed(farm, catalog, next);
    }
    panic!("bounded tiny fixture did not reach physical phase");
}

#[test]
fn oven_ready_and_real_resident_pickup_are_distinct_from_physical_barn_deposit() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = oven_farm(&catalog);
    admit(&mut farm, &catalog, stored_chain("phases-one"));
    advance_until(&mut farm, &catalog, |farm| {
        farm.oven
            .queue
            .first()
            .is_some_and(|job| job.status == OvenJobStatus::Producing)
    });
    let ready = farm.oven.queue[0].ready_at_ms;
    assert!(farm.last_update_ms < ready);
    assert_eq!(inventory_quantity(&farm, "bread"), 0);
    let mut restored: FarmState = serde_json::from_value(state(&farm)).unwrap();
    advance_until(&mut restored, &catalog, |farm| {
        farm.resident_inventories
            .get("man")
            .is_some_and(|inventory| inventory.items.get("bread") == Some(&1))
    });
    assert!(
        restored.last_update_ms >= ready,
        "no pickup before actual autonomous readiness"
    );
    assert!(restored.oven.queue.is_empty());
    assert_eq!(
        inventory_quantity(&restored, "bread"),
        0,
        "carried output is not physically in Barn"
    );
    let mut carried_reload: FarmState = serde_json::from_value(state(&restored)).unwrap();
    complete(&mut carried_reload, &catalog);
    assert_eq!(inventory_quantity(&carried_reload, "bread"), 1);
}

#[test]
fn stop_after_final_real_pickup_uses_existing_safe_physical_cleanup_and_reload() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = oven_farm(&catalog);
    admit(&mut farm, &catalog, stored_chain("cleanup-one"));
    advance_until(&mut farm, &catalog, |farm| {
        farm.resident_inventories
            .get("man")
            .is_some_and(|inventory| inventory.items.get("bread") == Some(&1))
    });
    assert_eq!(inventory_quantity(&farm, "bread"), 0);
    let task = farm.resident_task_queues["man"][0].id.clone();
    let now = farm.last_update_ms;
    let stopped = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::CancelResidentTask {
            resident_id: "man".into(),
            task_id: task,
        },
        now,
    );
    assert!(
        stopped.accepted,
        "safe final cleanup stop rejected: {:?}",
        stopped.error
    );
    let mut restored: FarmState = serde_json::from_value(state(&farm)).unwrap();
    complete(&mut restored, &catalog);
    assert_eq!(
        inventory_quantity(&restored, "bread"),
        1,
        "completed real output must survive safe cleanup"
    );
    assert_eq!(
        inventory_quantity(&restored, "wheat"),
        3,
        "used ingredients cannot be refunded"
    );
    let settled = state(&restored);
    let now = restored.last_update_ms;
    apply_elapsed(&mut restored, &catalog, now);
    assert_eq!(state(&restored), settled);
}

#[test]
fn planned_limited_tool_custody_has_nonoverlapping_actual_pickup_and_return_intervals() {
    use std::collections::BTreeMap;
    let catalog = CatalogDocument::default_catalog();
    let mut farm = ripe_farm(&catalog);
    sell_stored_wheat(&mut farm, &catalog);
    admit(&mut farm, &catalog, future_chain("intervals-one"));
    let mut events: BTreeMap<my_farm_core::ToolKind, Vec<(i64, i64, String)>> = BTreeMap::new();
    let initial: BTreeMap<_, BTreeMap<_, _>> = farm
        .resident_inventories
        .iter()
        .map(|(resident, inventory)| {
            (
                resident.clone(),
                inventory
                    .tools
                    .iter()
                    .map(|(tool, quantity)| (*tool, i64::from(*quantity)))
                    .collect(),
            )
        })
        .collect();
    conserved(&farm);
    for (resident, queue) in &farm.resident_task_queues {
        for task in queue {
            let mut at = task.ready_at_ms;
            for (index, step) in task.steps.iter().enumerate() {
                if index > 0 {
                    at += step.duration_ms
                }
                match &step.work {
                    ResidentTaskStepWork::PickupTools { tools, .. } => {
                        for tool in tools {
                            events.entry(tool.tool_kind).or_default().push((
                                at,
                                i64::from(tool.quantity),
                                resident.clone(),
                            ));
                        }
                    }
                    ResidentTaskStepWork::ReturnTools { tools, .. } => {
                        for tool in tools {
                            events.entry(tool.tool_kind).or_default().push((
                                at,
                                -i64::from(tool.quantity),
                                resident.clone(),
                            ));
                        }
                    }
                    _ => {}
                }
            }
        }
    }
    let sickle = my_farm_core::ToolKind::Sickle;
    let initial_sickle: i64 = initial
        .values()
        .map(|tools| tools.get(&sickle).copied().unwrap_or(0))
        .sum();
    let sickle_events = events
        .get(&sickle)
        .expect("actual Sickle custody commitments");
    assert_eq!(
        initial_sickle
            + sickle_events
                .iter()
                .filter(|(_, delta, _)| *delta > 0)
                .map(|(_, delta, _)| delta)
                .sum::<i64>(),
        2,
        "both assigned harvests require real initial or future Sickle pickup"
    );
    assert_eq!(
        sickle_events
            .iter()
            .filter(|(_, delta, _)| *delta < 0)
            .map(|(_, delta, _)| -delta)
            .sum::<i64>(),
        2,
        "both assigned harvests must physically return the Sickle"
    );
    for (tool, mut events) in events {
        events.sort_unstable(); // return before pickup at equal timestamps
        let mut ownership: BTreeMap<String, i64> = initial
            .iter()
            .map(|(resident, tools)| (resident.clone(), tools.get(&tool).copied().unwrap_or(0)))
            .collect();
        assert!((0..=1).contains(&ownership.values().sum::<i64>()));
        for (at, delta, resident) in events {
            let held = ownership.entry(resident).or_default();
            *held += delta;
            assert!(
                (0..=1).contains(held),
                "{tool:?} returned by nonholder or duplicated pickup at{at}"
            );
            assert!(
                (0..=1).contains(&ownership.values().sum::<i64>()),
                "{tool:?} physical custody conflict at{at}"
            );
        }
        assert!(
            ownership.values().all(|held| *held == 0),
            "{tool:?} missing physical return"
        );
    }
    complete(&mut farm, &catalog);
    conserved(&farm);
}

#[test]
fn authoritative_view_maps_local_jobs_to_real_ids_assignments_dependencies_and_quantities() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = ripe_farm(&catalog);
    sell_stored_wheat(&mut farm, &catalog);
    let request = future_chain("view-one");
    admit(&mut farm, &catalog, request.clone());
    let view = serde_json::to_value(my_farm_core::farm_view(&farm, &catalog)).unwrap();
    let chain = &view["concrete_chains"]["view-one"];
    assert!(chain.is_object(), "authoritative chain read model missing");
    let jobs = chain["jobs"].as_object().expect("local-job mapping");
    assert_eq!(jobs.len(), 4);
    for input in request["jobs"].as_array().unwrap() {
        let local = input["id"].as_str().unwrap();
        let job = &jobs[local];
        assert_eq!(job["resident_id"], input["resident_id"]);
        assert_eq!(job["after"], input["after"]);
        assert_eq!(
            job["inputs"], input["inputs"],
            "backed bindings must remain inspectable, not invented available stock"
        );
        let actual = job["task_ids"]
            .as_array()
            .expect("actual committed task IDs");
        assert!(!actual.is_empty());
        for id in actual {
            let id = id.as_str().unwrap();
            assert!(
                farm.resident_task_queues[input["resident_id"].as_str().unwrap()]
                    .iter()
                    .any(|task| task.id == id)
            );
        }
    }
    let bake_id = jobs["bake"]["production_job_id"]
        .as_str()
        .expect("actual Oven identity");
    assert!(
        farm.oven
            .queue
            .iter()
            .any(|job| job.id == bake_id && job.recipe_id == "bread")
    );
    assert_eq!(jobs["collect"]["production_job_id"].as_str(), Some(bake_id));
    // Coalescing jobs into a task is allowed; each mapped boundary must still
    // correspond to actual authoritative work on its assigned Resident.
    for local in ["harvest-a", "harvest-b", "bake", "collect"] {
        let job = &jobs[local];
        let ids = job["task_ids"].as_array().unwrap();
        let queue = &farm.resident_task_queues[job["resident_id"].as_str().unwrap()];
        assert!(
            queue
                .iter()
                .filter(|task| ids.iter().any(|id| id.as_str() == Some(&task.id)))
                .flat_map(|task| &task.steps)
                .any(|step| match (&step.work, local) {
                    (
                        ResidentTaskStepWork::HarvestCrop { crop_id, quantity },
                        "harvest-a" | "harvest-b",
                    ) => crop_id == "wheat" && *quantity == 2,
                    (ResidentTaskStepWork::StartOvenRecipe { job_id, recipe_id }, "bake")
                    | (ResidentTaskStepWork::CollectOvenJob { job_id, recipe_id }, "collect") =>
                        job_id == bake_id && recipe_id == "bread",
                    _ => false,
                }),
            "{local} mapping has no real work boundary"
        );
    }
    assert_eq!(
        inventory_quantity(&farm, "wheat"),
        0,
        "view cannot materialize future Wheat"
    );
    let restored: FarmState = serde_json::from_value(state(&farm)).unwrap();
    let roundtrip = serde_json::to_value(my_farm_core::farm_view(&restored, &catalog)).unwrap();
    assert_eq!(roundtrip["concrete_chains"], view["concrete_chains"]);
}

#[test]
fn already_accepted_manual_harvest_ids_back_new_consumer_without_replanning_old_work() {
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
    let old = farm.resident_task_queues["woman"].clone();
    let mut remaining = 3;
    let mut bindings = vec![];
    for task in &old {
        let output: u32 = task
            .steps
            .iter()
            .filter_map(|step| match &step.work {
                ResidentTaskStepWork::HarvestCrop { crop_id, quantity } if crop_id == "wheat" => {
                    Some(*quantity)
                }
                _ => None,
            })
            .sum();
        let quantity = output.min(remaining);
        if quantity > 0 {
            bindings.push(json!({"item_id":"wheat","quantity":quantity,
                "source":{"type":"committed_task_output","resident_id":"woman","task_id":task.id}}));
            remaining -= quantity;
        }
    }
    assert_eq!(
        remaining, 0,
        "actual accepted harvest lacks three backed Wheat"
    );
    let mut request = stored_chain("old-producer-one");
    request["jobs"][0]["inputs"] = json!(bindings);
    admit(&mut farm, &catalog, request);
    assert_eq!(
        &farm.resident_task_queues["woman"][..old.len()],
        old.as_slice(),
        "binding an old producer cannot replace its accepted identity/timing"
    );
    complete(&mut farm, &catalog);
    assert_eq!(inventory_quantity(&farm, "bread"), 1);
    assert_eq!(inventory_quantity(&farm, "wheat"), 1);
}

fn committed_harvest_task(farm: &FarmState, resident: &str) -> String {
    farm.resident_task_queues[resident].iter().find(|task|
        task.steps.iter().any(|step| matches!(&step.work,
            ResidentTaskStepWork::HarvestCrop { crop_id, quantity } if crop_id == "wheat" && *quantity == 2)))
        .expect("real accepted Wheat producer").id.clone()
}

#[test]
fn actual_task_and_chain_job_aliases_cannot_claim_one_real_harvest_output_twice() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = ripe_farm(&catalog);
    sell_stored_wheat(&mut farm, &catalog);
    // Real unrelated stock must not hide a producer-binding overclaim.
    accepted(
        &mut farm,
        &catalog,
        FarmCommand::BuyMarketItem {
            item_id: "wheat".into(),
            quantity: 6,
        },
    );
    admit(&mut farm, &catalog, future_chain("alias-first"));
    let task_a = committed_harvest_task(&farm, "woman");
    let mut alias = stored_chain("alias-bad");
    alias["jobs"][0]["inputs"] = json!([
        {"item_id":"wheat","quantity":1,"source":{"type":"committed_task_output","resident_id":"woman","task_id":task_a}},
        {"item_id":"wheat","quantity":2,"source":{"type":"stored"}}
    ]);
    reject(
        &mut farm,
        &catalog,
        alias,
        &["producer", "quantity", "claim", "wheat", "reserved"],
    );
    // The other actual producer still has its legitimate unclaimed one Wheat.
    let mut legitimate = stored_chain("alias-good");
    legitimate["jobs"][0]["inputs"] = json!([
        {"item_id":"wheat","quantity":1,"source":{"type":"producer_output","chain_id":"alias-first","job_id":"harvest-b"}},
        {"item_id":"wheat","quantity":2,"source":{"type":"stored"}}
    ]);
    admit(&mut farm, &catalog, legitimate);
    complete(&mut farm, &catalog);
    assert_eq!(inventory_quantity(&farm, "bread"), 2);
    assert_eq!(inventory_quantity(&farm, "wheat"), 4);
}

#[test]
fn completed_historical_producer_cannot_relabel_new_unrelated_stored_wheat() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = ripe_farm(&catalog);
    sell_stored_wheat(&mut farm, &catalog);
    admit(&mut farm, &catalog, future_chain("history-first"));
    let task_b = committed_harvest_task(&farm, "man");
    complete(&mut farm, &catalog);
    assert_eq!(inventory_quantity(&farm, "wheat"), 1);
    sell_stored_wheat(&mut farm, &catalog);
    accepted(
        &mut farm,
        &catalog,
        FarmCommand::BuyMarketItem {
            item_id: "wheat".into(),
            quantity: 3,
        },
    );
    for source in [
        json!({"type":"producer_output","chain_id":"history-first","job_id":"harvest-b"}),
        json!({"type":"committed_task_output","resident_id":"man","task_id":task_b}),
    ] {
        let mut request = stored_chain("history-bad");
        request["jobs"][0]["inputs"] = json!([
            {"item_id":"wheat","quantity":1,"source":source},
            {"item_id":"wheat","quantity":2,"source":{"type":"stored"}}
        ]);
        reject(
            &mut farm,
            &catalog,
            request,
            &[
                "producer",
                "completed",
                "future",
                "quantity",
                "claim",
                "wheat",
            ],
        );
    }
    // Identifying actual current storage remains legitimate; only false origin fails.
    admit(&mut farm, &catalog, stored_chain("history-current-storage"));
    complete(&mut farm, &catalog);
    assert_eq!(inventory_quantity(&farm, "bread"), 2);
    assert_eq!(inventory_quantity(&farm, "wheat"), 0);
}
