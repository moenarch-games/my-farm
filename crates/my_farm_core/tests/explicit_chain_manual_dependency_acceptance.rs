//! Independent public-command acceptance for ordinary Plant backing a concrete Harvest.
#[path = "acceptance/explicit_chain_fixture.rs"]
#[allow(dead_code)]
mod fixture;

use fixture::{accepted, conserved, finish_tasks, oven_farm, state};
use my_farm_core::{
    CatalogDocument, FarmCommand, FarmState, ResidentTaskStepWork, apply_command,
    inventory_quantity,
};
use serde_json::json;

fn ordinary_plant_chain(catalog: &CatalogDocument) -> (FarmState, String, String) {
    let mut farm = oven_farm(catalog);
    for (plot, crop) in [("plot-3", "wheat"), ("plot-1", "corn")] {
        accepted(
            &mut farm,
            catalog,
            FarmCommand::PlantCrop {
                plot_id: plot.into(),
                crop_id: crop.into(),
            },
        );
    }
    let plant = farm.resident_task_queues["woman"]
        .iter()
        .find(|task| {
            task.steps.iter().any(|step| {
                matches!(&step.work, ResidentTaskStepWork::PlantCrop { crop_id, .. } if crop_id == "corn")
            })
        })
        .expect("accepted ordinary Corn Plant is pending")
        .id
        .clone();
    let command = serde_json::from_value(json!({
        "type":"admit_concrete_chain", "chain_id":"manual-growth", "jobs":[
            {"id":"harvest", "resident_id":"woman", "work":{"type":"harvest_crop","plot_id":"plot-1"}, "after":[], "inputs":[]}
        ]
    }))
    .expect("public concrete-chain command");
    accepted(&mut farm, catalog, command);
    let harvest = farm.concrete_chains["manual-growth"].jobs["harvest"].task_ids[0].clone();
    assert!(
        farm.field_plots
            .iter()
            .find(|plot| plot.id == "plot-1")
            .unwrap()
            .crop
            .is_none(),
        "real ordinary Plant has not planted the crop yet"
    );
    (farm, plant, harvest)
}

fn rejects_atomically(farm: &mut FarmState, catalog: &CatalogDocument, command: FarmCommand) {
    let before = state(farm);
    let now = farm.last_update_ms;
    let result = apply_command(farm, catalog, command, now);
    assert!(
        !result.accepted,
        "accepted Harvest must retain its real ordinary Plant prerequisite"
    );
    assert!(
        result.error.is_some(),
        "rejection must explain the conflict"
    );
    assert_eq!(state(farm), before, "rejection must preserve commitments");
    conserved(farm);
}

#[test]
fn ordinary_plant_can_back_a_concrete_harvest_without_redundant_after() {
    let catalog = CatalogDocument::default_catalog();
    let (mut farm, _, _) = ordinary_plant_chain(&catalog);
    let corn = inventory_quantity(&farm, "corn");
    finish_tasks(&mut farm, &catalog);
    assert_eq!(
        inventory_quantity(&farm, "corn"),
        corn - 1 + catalog.crop("corn").unwrap().harvest_quantity
    );
    conserved(&farm);
}

#[test]
fn concrete_harvest_cannot_reorder_before_its_ordinary_plant() {
    let catalog = CatalogDocument::default_catalog();
    let (mut farm, plant, harvest) = ordinary_plant_chain(&catalog);
    rejects_atomically(
        &mut farm,
        &catalog,
        FarmCommand::ReorderResidentTask {
            resident_id: "woman".into(),
            task_id: harvest,
            before_task_id: Some(plant),
        },
    );
}

#[test]
fn ordinary_plant_cannot_stop_while_its_concrete_harvest_remains_committed() {
    let catalog = CatalogDocument::default_catalog();
    let (mut farm, plant, _) = ordinary_plant_chain(&catalog);
    rejects_atomically(
        &mut farm,
        &catalog,
        FarmCommand::CancelResidentTask {
            resident_id: "woman".into(),
            task_id: plant,
        },
    );
}
