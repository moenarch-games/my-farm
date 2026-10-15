//! Independent retrospective #225 review regressions. Real commands and saved delays only.
#[path = "acceptance/explicit_chain_fixture.rs"]
#[allow(dead_code)]
// Shared input fixture also supplies helpers used by the original protected suites.
mod fixture;

use fixture::{accepted, conserved, finish_tasks, oven_farm, state};
use my_farm_core::{
    CatalogDocument, FarmCommand, FarmState, ResidentTaskStepWork, apply_command, apply_elapsed,
    inventory_quantity,
};
use serde_json::{Value, json};

fn admit(farm: &mut FarmState, catalog: &CatalogDocument, jobs: Value) {
    let command = serde_json::from_value(json!({
        "type": "admit_concrete_chain", "chain_id": "implicit-growth", "jobs": jobs,
    }))
    .expect("existing public concrete-chain command");
    accepted(farm, catalog, command);
}

fn implicit_same_resident(catalog: &CatalogDocument) -> FarmState {
    let mut farm = oven_farm(catalog);
    // Genuine current work ensures Plant and Harvest are future queue entries.
    accepted(
        &mut farm,
        catalog,
        FarmCommand::PlantCrop {
            plot_id: "plot-3".into(),
            crop_id: "wheat".into(),
        },
    );
    admit(
        &mut farm,
        catalog,
        json!([
            {"id":"plant","resident_id":"woman","work":{"type":"plant_crop","plot_id":"plot-1","crop_id":"corn"},"after":[],"inputs":[{"item_id":"corn","quantity":1,"source":{"type":"stored"}}]},
            {"id":"harvest","resident_id":"woman","work":{"type":"harvest_crop","plot_id":"plot-1"},"after":[],"inputs":[]}
        ]),
    );
    assert!(
        farm.field_plots
            .iter()
            .find(|plot| plot.id == "plot-1")
            .unwrap()
            .crop
            .is_none()
    );
    farm
}

fn reject_dependency(farm: &mut FarmState, catalog: &CatalogDocument, command: FarmCommand) {
    let before = state(farm);
    let now = farm.last_update_ms;
    let result = apply_command(farm, catalog, command, now);
    assert!(
        !result.accepted,
        "implicit same-plot Plant dependency was discarded"
    );
    assert_eq!(state(farm), before, "dependency rejection must be atomic");
    let reason = result
        .error
        .expect("useful rejection")
        .message
        .to_lowercase();
    assert!(
        ["depend", "conflict"]
            .iter()
            .any(|word| reason.contains(word)),
        "unrelated rejection: {reason}"
    );
    conserved(farm);
}

#[test]
fn implicit_same_plot_plant_then_harvest_remains_admissible_without_redundant_after() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = implicit_same_resident(&catalog);
    let corn = inventory_quantity(&farm, "corn");
    finish_tasks(&mut farm, &catalog);
    assert_eq!(
        inventory_quantity(&farm, "corn"),
        corn - 1 + catalog.crop("corn").unwrap().harvest_quantity
    );
    assert!(
        farm.field_plots
            .iter()
            .find(|plot| plot.id == "plot-1")
            .unwrap()
            .crop
            .is_none()
    );
    conserved(&farm);
}

#[test]
fn implicit_same_plot_harvest_cannot_reorder_before_its_accepted_plant() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = implicit_same_resident(&catalog);
    let jobs = &farm.concrete_chains["implicit-growth"].jobs;
    let harvest = jobs["harvest"].task_ids[0].clone();
    let plant = jobs["plant"].task_ids[0].clone();
    reject_dependency(
        &mut farm,
        &catalog,
        FarmCommand::ReorderResidentTask {
            resident_id: "woman".into(),
            task_id: harvest,
            before_task_id: Some(plant),
        },
    );
    finish_tasks(&mut farm, &catalog);
    assert!(
        farm.field_plots
            .iter()
            .find(|plot| plot.id == "plot-1")
            .unwrap()
            .crop
            .is_none()
    );
    conserved(&farm);
}

#[test]
fn implicit_same_plot_harvest_protects_its_accepted_plant_from_individual_stop() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = implicit_same_resident(&catalog);
    let plant = farm.concrete_chains["implicit-growth"].jobs["plant"].task_ids[0].clone();
    reject_dependency(
        &mut farm,
        &catalog,
        FarmCommand::CancelResidentTask {
            resident_id: "woman".into(),
            task_id: plant,
        },
    );
    finish_tasks(&mut farm, &catalog);
    conserved(&farm);
}

fn delayed_two_hop(catalog: &CatalogDocument) -> (FarmState, i64, i64, u32) {
    let mut farm = oven_farm(catalog);
    admit(
        &mut farm,
        catalog,
        json!([
            {"id":"a-upstream","resident_id":"woman","work":{"type":"plant_crop","plot_id":"plot-2","crop_id":"wheat"},"after":[],"inputs":[{"item_id":"wheat","quantity":1,"source":{"type":"stored"}}]},
            {"id":"z-plant","resident_id":"woman","work":{"type":"plant_crop","plot_id":"plot-1","crop_id":"corn"},"after":["a-upstream"],"inputs":[{"item_id":"corn","quantity":1,"source":{"type":"stored"}}]},
            {"id":"h-harvest","resident_id":"man","work":{"type":"harvest_crop","plot_id":"plot-1"},"after":["z-plant"],"inputs":[]}
        ]),
    );
    let starting_corn = inventory_quantity(&farm, "corn");
    // Obtain an actual undelayed physical completion time rather than guessed task duration.
    let mut reference = farm.clone();
    finish_tasks(&mut reference, catalog);
    let formerly_complete_at = reference.last_update_ms;
    let current_deadline = farm.resident_task_queues["woman"][0].ready_at_ms;
    let delayed_deadline = formerly_complete_at + 600_000;
    assert!(delayed_deadline > current_deadline);
    let mut saved = state(&farm);
    saved["resident_task_queues"]["woman"][0]["ready_at_ms"] = json!(delayed_deadline);
    let delayed =
        serde_json::from_value(saved).expect("reload actual accepted state with upstream delay");
    (
        delayed,
        formerly_complete_at,
        delayed_deadline,
        starting_corn,
    )
}

fn assert_waiting_before_plant(farm: &FarmState, corn: u32) {
    assert!(
        farm.field_plots
            .iter()
            .find(|plot| plot.id == "plot-1")
            .unwrap()
            .crop
            .is_none(),
        "upstream Plant must still be pending at this witness"
    );
    let harvest = &farm.concrete_chains["implicit-growth"].jobs["h-harvest"];
    assert!(
        farm.resident_task_queues["man"]
            .iter()
            .any(|task| harvest.task_ids.contains(&task.id)
                && task
                    .steps
                    .iter()
                    .any(|step| matches!(step.work, ResidentTaskStepWork::HarvestCrop { .. }))),
        "absent crop was harvested before its transitive producer ran"
    );
    assert_eq!(
        inventory_quantity(farm, "corn"),
        corn,
        "phantom harvest credited Silo stock"
    );
    assert!(
        farm.resident_inventories.values().all(|inventory| inventory
            .items
            .get("corn")
            .copied()
            .unwrap_or(0)
            == 0),
        "absent crop produced physical cargo"
    );
    assert!(
        farm.blocked_resident_tasks.is_empty(),
        "accepted dependency waits rather than ordinary blocking"
    );
    conserved(farm);
}

#[test]
fn transitive_upstream_delay_keeps_cross_resident_harvest_waiting_while_crop_is_absent() {
    let catalog = CatalogDocument::default_catalog();
    let (mut farm, old_complete, delayed_deadline, corn) = delayed_two_hop(&catalog);
    apply_elapsed(&mut farm, &catalog, old_complete);
    assert_waiting_before_plant(&farm, corn);
    let mut reloaded: FarmState = serde_json::from_value(state(&farm)).unwrap();
    apply_elapsed(&mut reloaded, &catalog, delayed_deadline - 1);
    assert_waiting_before_plant(&reloaded, corn);
    finish_tasks(&mut reloaded, &catalog);
    assert!(
        reloaded
            .field_plots
            .iter()
            .find(|plot| plot.id == "plot-1")
            .unwrap()
            .crop
            .is_none()
    );
    assert_eq!(
        inventory_quantity(&reloaded, "corn"),
        corn - 1 + catalog.crop("corn").unwrap().harvest_quantity
    );
    conserved(&reloaded);
}

#[test]
fn transitive_delayed_growth_has_equal_physical_results_for_large_and_split_elapsed_advances() {
    let catalog = CatalogDocument::default_catalog();
    let (mut large, old_complete, delayed_deadline, corn) = delayed_two_hop(&catalog);
    let mut split = large.clone();
    apply_elapsed(&mut large, &catalog, old_complete);
    for at in [old_complete / 3, old_complete * 2 / 3, old_complete] {
        apply_elapsed(&mut split, &catalog, at);
    }
    assert_waiting_before_plant(&large, corn);
    assert_waiting_before_plant(&split, corn);
    let final_at = delayed_deadline + 600_000;
    apply_elapsed(&mut large, &catalog, final_at);
    for at in [delayed_deadline - 1, delayed_deadline, final_at] {
        apply_elapsed(&mut split, &catalog, at);
    }
    assert_eq!(
        state(&large),
        state(&split),
        "elapsed batching changed actual committed result"
    );
    assert!(large.resident_task_queues.values().all(Vec::is_empty));
    assert!(large.blocked_resident_tasks.is_empty());
    assert_eq!(
        inventory_quantity(&large, "corn"),
        corn - 1 + catalog.crop("corn").unwrap().harvest_quantity
    );
    conserved(&large);
}
