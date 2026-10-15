//! Independent retrospective #225 regression: a delayed ordinary Plant must keep
//! transitive explicit edges behind the concrete Harvest it backs. Real public
//! commands and time; delays come from a later deadline restored into saved state
//! or from a public future-queue reorder. No crop, task output or stock is injected.
#[path = "acceptance/explicit_chain_fixture.rs"]
#[allow(dead_code)]
// Shared input fixture also supplies helpers used by the original protected suites.
mod fixture;

use fixture::{accepted, conserved, finish_tasks, oven_farm, state};
use my_farm_core::{
    CatalogDocument, FarmCommand, FarmState, ResidentTaskStepWork, apply_command, apply_elapsed,
    inventory_quantity,
};
use serde_json::json;

struct Chain {
    farm: FarmState,
    corn: u32,
    plant_task: String,
}

fn plot_crop(farm: &FarmState, plot: &str) -> Option<String> {
    farm.field_plots
        .iter()
        .find(|candidate| candidate.id == plot)
        .unwrap()
        .crop
        .as_ref()
        .map(|crop| crop.item_id.clone())
}

/// Separate, tool-independent accepted Oven work keeps the harvesting Resident
/// busy until after the ordinary Plant has run, so Harvest admission on that
/// Resident's queue observes the planted crop. It holds no Hoe or Sickle.
fn keep_busy(farm: &mut FarmState, catalog: &CatalogDocument, resident: &str) {
    let filler = serde_json::from_value(json!({
        "type":"admit_concrete_chain", "chain_id":"filler", "jobs":[
            {"id":"bake","resident_id":resident,"work":{"type":"start_oven_recipe","recipe_id":"bread"},
             "after":[],"inputs":[{"item_id":"wheat","quantity":3,"source":{"type":"stored"}}]},
            {"id":"collect","resident_id":resident,"work":{"type":"collect_oven_job","producer_id":"bake"},"after":["bake"],"inputs":[]}
        ]
    }))
    .expect("existing public concrete-chain command");
    accepted(farm, catalog, filler);
}

/// Ordinary Corn Plant on `planter`, concrete Harvest of that plot on `harvester`,
/// and a concrete Wheat Plant on the other Resident ordered `after: [harvest]`.
fn ordinary_plant_chain(catalog: &CatalogDocument, planter: &str, harvester: &str) -> Chain {
    let dependent = if harvester == "woman" { "man" } else { "woman" };
    let mut farm = oven_farm(catalog);
    accepted(
        &mut farm,
        catalog,
        FarmCommand::SelectResident {
            resident_id: planter.into(),
        },
    );
    accepted(
        &mut farm,
        catalog,
        FarmCommand::PlantCrop {
            plot_id: "plot-1".into(),
            crop_id: "corn".into(),
        },
    );
    let plant_task = farm.resident_task_queues[planter]
        .iter()
        .find(|task| {
            task.steps.iter().any(|step| {
                matches!(&step.work, ResidentTaskStepWork::PlantCrop { crop_id, .. } if crop_id == "corn")
            })
        })
        .expect("accepted ordinary Corn Plant is pending")
        .id
        .clone();
    if harvester != planter {
        keep_busy(&mut farm, catalog, harvester);
    }
    let command = serde_json::from_value(json!({
        "type":"admit_concrete_chain", "chain_id":"ordinary-delay", "jobs":[
            {"id":"harvest","resident_id":harvester,"work":{"type":"harvest_crop","plot_id":"plot-1"},"after":[],"inputs":[]},
            {"id":"follow","resident_id":dependent,"work":{"type":"plant_crop","plot_id":"plot-2","crop_id":"wheat"},
             "after":["harvest"],"inputs":[{"item_id":"wheat","quantity":1,"source":{"type":"stored"}}]}
        ]
    }))
    .expect("existing public concrete-chain command");
    accepted(&mut farm, catalog, command);
    assert!(plot_crop(&farm, "plot-1").is_none());
    assert!(plot_crop(&farm, "plot-2").is_none());
    Chain {
        corn: inventory_quantity(&farm, "corn"),
        farm,
        plant_task,
    }
}

/// Restore the accepted state with a later authoritative ordinary Plant deadline.
/// The delay target comes from an actual undelayed completion, not a guessed duration.
fn delayed(catalog: &CatalogDocument, chain: &Chain, planter: &str) -> (FarmState, i64) {
    let mut reference = chain.farm.clone();
    finish_tasks(&mut reference, catalog);
    let formerly_complete_at = reference.last_update_ms;
    let mut saved = state(&chain.farm);
    let queue = saved["resident_task_queues"][planter]
        .as_array_mut()
        .unwrap();
    let plant = queue
        .iter_mut()
        .find(|task| task["id"] == json!(chain.plant_task))
        .expect("ordinary Plant still queued");
    let current = plant["ready_at_ms"].as_i64().unwrap();
    let delayed_deadline = formerly_complete_at + 600_000;
    assert!(delayed_deadline > current);
    plant["ready_at_ms"] = json!(delayed_deadline);
    let farm = serde_json::from_value(saved).expect("reload accepted state with delayed Plant");
    (farm, formerly_complete_at)
}

fn harvest_pending(farm: &FarmState) -> bool {
    let job = &farm.concrete_chains["ordinary-delay"].jobs["harvest"];
    farm.resident_task_queues[&job.resident_id]
        .iter()
        .any(|task| {
            job.task_ids.contains(&task.id)
                && task
                    .steps
                    .iter()
                    .any(|step| matches!(step.work, ResidentTaskStepWork::HarvestCrop { .. }))
        })
}

fn follow_pending(farm: &FarmState) -> bool {
    let job = &farm.concrete_chains["ordinary-delay"].jobs["follow"];
    farm.resident_task_queues[&job.resident_id]
        .iter()
        .any(|task| {
            job.task_ids.contains(&task.id)
                && task
                    .steps
                    .iter()
                    .any(|step| matches!(step.work, ResidentTaskStepWork::PlantCrop { .. }))
        })
}

/// `follow` must not physically run while its explicit Harvest producer has
/// not yet collected the matured Corn.
fn assert_follow_waits(farm: &FarmState, at: i64) {
    if !harvest_pending(farm) {
        return;
    }
    assert!(
        follow_pending(farm) && plot_crop(farm, "plot-2").is_none(),
        "after:[harvest] job planted at {at} while its Harvest was still waiting for the crop"
    );
    assert!(farm.blocked_resident_tasks.is_empty());
    conserved(farm);
}

fn assert_chain_completes(farm: &mut FarmState, catalog: &CatalogDocument, chain: &Chain) {
    finish_tasks(farm, catalog);
    assert!(farm.resident_task_queues.values().all(Vec::is_empty));
    assert!(plot_crop(farm, "plot-1").is_none(), "Corn was harvested");
    assert_eq!(plot_crop(farm, "plot-2").as_deref(), Some("wheat"));
    assert_eq!(
        inventory_quantity(farm, "corn"),
        chain.corn - 1 + catalog.crop("corn").unwrap().harvest_quantity
    );
    conserved(farm);
}

fn delayed_case(planter: &str, harvester: &str) {
    let catalog = CatalogDocument::default_catalog();
    let chain = ordinary_plant_chain(&catalog, planter, harvester);
    let (mut farm, formerly_complete_at) = delayed(&catalog, &chain, planter);
    let end = formerly_complete_at + 600_000 + 2 * formerly_complete_at;
    let mut at = farm.last_update_ms;
    while at < end {
        at += 1_000;
        apply_elapsed(&mut farm, &catalog, at);
        assert_follow_waits(&farm, at);
        if at == formerly_complete_at - formerly_complete_at % 1_000 {
            // Delayed phase survives save/reload.
            farm = serde_json::from_value(state(&farm)).unwrap();
        }
    }
    assert_chain_completes(&mut farm, &catalog, &chain);
}

#[test]
fn undelayed_ordinary_plant_orders_dependent_after_concrete_harvest() {
    let catalog = CatalogDocument::default_catalog();
    for (planter, harvester) in [("woman", "woman"), ("woman", "man")] {
        let chain = ordinary_plant_chain(&catalog, planter, harvester);
        let mut farm = chain.farm.clone();
        let mut at = farm.last_update_ms;
        while !farm.resident_task_queues.values().all(Vec::is_empty) {
            at += 1_000;
            apply_elapsed(&mut farm, &catalog, at);
            assert_follow_waits(&farm, at);
            assert!(at < 10_000_000, "bounded fixture failed to settle");
        }
        assert_chain_completes(&mut farm, &catalog, &chain);
    }
}

#[test]
fn delayed_cross_resident_ordinary_plant_keeps_after_harvest_job_waiting() {
    delayed_case("woman", "man");
}

#[test]
fn delayed_same_resident_ordinary_plant_keeps_after_harvest_job_waiting() {
    delayed_case("woman", "woman");
}

/// The ordinary Plant is delayed through a real public future-queue reorder that
/// places the transitive `after: [harvest]` consumer ahead of it on the planting
/// Resident. Either the reorder is rejected atomically, or execution still keeps
/// the consumer behind the actual Harvest and the whole chain completes.
#[test]
fn reorder_delaying_ordinary_plant_cannot_let_after_harvest_job_run_first() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = oven_farm(&catalog);
    // Current Wheat work makes the ordinary Corn Plant a future, reorderable task.
    for (plot, crop) in [("plot-3", "wheat"), ("plot-1", "corn")] {
        accepted(
            &mut farm,
            &catalog,
            FarmCommand::PlantCrop {
                plot_id: plot.into(),
                crop_id: crop.into(),
            },
        );
    }
    let plant = farm.resident_task_queues["woman"][1].id.clone();
    keep_busy(&mut farm, &catalog, "man");
    let command = serde_json::from_value(json!({
        "type":"admit_concrete_chain", "chain_id":"ordinary-delay", "jobs":[
            {"id":"harvest","resident_id":"man","work":{"type":"harvest_crop","plot_id":"plot-1"},"after":[],"inputs":[]},
            {"id":"follow","resident_id":"woman","work":{"type":"plant_crop","plot_id":"plot-2","crop_id":"wheat"},
             "after":["harvest"],"inputs":[{"item_id":"wheat","quantity":1,"source":{"type":"stored"}}]}
        ]
    }))
    .expect("existing public concrete-chain command");
    accepted(&mut farm, &catalog, command);
    let corn = inventory_quantity(&farm, "corn");
    let follow = farm.concrete_chains["ordinary-delay"].jobs["follow"].task_ids[0].clone();
    let before = state(&farm);
    let now = farm.last_update_ms;
    let outcome = apply_command(
        &mut farm,
        &catalog,
        FarmCommand::ReorderResidentTask {
            resident_id: "woman".into(),
            task_id: follow,
            before_task_id: Some(plant),
        },
        now,
    );
    if !outcome.accepted {
        assert!(
            outcome.error.is_some(),
            "rejection must explain the conflict"
        );
        assert_eq!(state(&farm), before, "rejection must preserve commitments");
    }
    let mut at = farm.last_update_ms;
    while !farm.resident_task_queues.values().all(Vec::is_empty) {
        at += 1_000;
        apply_elapsed(&mut farm, &catalog, at);
        assert_follow_waits(&farm, at);
        assert!(at < 10_000_000, "accepted chain never completed physically");
    }
    assert!(plot_crop(&farm, "plot-1").is_none(), "Corn was harvested");
    assert_eq!(plot_crop(&farm, "plot-2").as_deref(), Some("wheat"));
    assert_eq!(
        inventory_quantity(&farm, "corn"),
        corn - 1 + catalog.crop("corn").unwrap().harvest_quantity
    );
    conserved(&farm);
}
