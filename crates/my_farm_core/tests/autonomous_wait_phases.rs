//! Autonomous elapsed phases release and reacquire the Resident (#271).
#[path = "acceptance/explicit_chain_fixture.rs"]
mod fixture;
use fixture::{accepted, oven_farm};
use my_farm_core::{
    AutonomousPhase, CatalogDocument, FarmCommand, FarmState, ResidentTask, ResidentTaskQueueState,
    ResidentTaskStepWork, ResidentWorkState, StepRequirement, apply_command, apply_elapsed,
    farm_view, inventory_quantity,
};
use serde_json::{Value, json};
use std::collections::BTreeSet;

const RESIDENT: &str = "man";

fn restored(farm: &FarmState) -> FarmState {
    serde_json::from_str(&serde_json::to_string(farm).unwrap()).unwrap()
}

fn admit_chain(farm: &mut FarmState, catalog: &CatalogDocument, chain: Value) {
    let command: FarmCommand = serde_json::from_value(chain).unwrap();
    let now = farm.last_update_ms;
    let outcome = apply_command(farm, catalog, command, now);
    assert!(outcome.accepted, "chain rejected: {:?}", outcome.error);
}

fn select(farm: &mut FarmState, catalog: &CatalogDocument) {
    accepted(
        farm,
        catalog,
        FarmCommand::SelectResident {
            resident_id: RESIDENT.into(),
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

fn queue(farm: &FarmState) -> &[ResidentTask] {
    farm.resident_task_queues
        .get(RESIDENT)
        .map(Vec::as_slice)
        .unwrap_or_default()
}

fn waiting_task(farm: &FarmState) -> &ResidentTask {
    queue(farm)
        .iter()
        .find(|task| {
            task.steps
                .first()
                .is_some_and(|step| step.is_autonomous_wait())
        })
        .expect("a task waits on an autonomous phase")
}

/// End times of a task's Resident-required Steps on Farm time.
fn resident_step_ends(task: &ResidentTask) -> Vec<i64> {
    let mut at = task.ready_at_ms;
    let mut ends = Vec::new();
    for (index, step) in task.steps.iter().enumerate() {
        if index > 0 {
            at += step.duration_ms;
        }
        if step.requires_resident() {
            ends.push(at);
        }
    }
    ends
}

fn next_time(farm: &FarmState) -> Option<i64> {
    farm.resident_task_queues
        .values()
        .filter_map(|queue| queue.first())
        .map(|task| task.ready_at_ms.max(farm.last_update_ms + 1))
        .min()
}

fn advance_until(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    done: impl Fn(&FarmState) -> bool,
) -> BTreeSet<&'static str> {
    let mut phases = BTreeSet::new();
    for _ in 0..256 {
        if done(farm) {
            return phases;
        }
        if let Some(phase) = phase(farm) {
            phases.insert(phase);
        }
        *farm = restored(farm);
        let next = next_time(farm).expect("work remains");
        apply_elapsed(farm, catalog, next);
        assert!(
            farm.blocked_resident_tasks.is_empty(),
            "{:?}",
            farm.blocked_resident_tasks
        );
    }
    panic!("condition never reached");
}

fn head_is_wait(farm: &FarmState) -> bool {
    queue(farm)
        .first()
        .and_then(|task| task.steps.first())
        .is_some_and(|step| step.is_autonomous_wait())
}

/// The phase the Resident is in, named by the head Step.
fn phase(farm: &FarmState) -> Option<&'static str> {
    let step = queue(farm).first()?.steps.first()?;
    Some(match &step.work {
        ResidentTaskStepWork::AutonomousWait { .. } => "wait",
        ResidentTaskStepWork::PlantCrop { .. } => "plant",
        ResidentTaskStepWork::HarvestCrop { .. } => "harvest",
        ResidentTaskStepWork::StartOvenRecipe { .. } => "start",
        ResidentTaskStepWork::CollectOvenJob { .. } => "collect",
        ResidentTaskStepWork::DepositItems { .. } => "deposit",
        ResidentTaskStepWork::PickupItems { .. } | ResidentTaskStepWork::PickupTools { .. } => {
            "pickup"
        }
        ResidentTaskStepWork::ReturnTools { .. } => "return",
        _ => "other",
    })
}

/// Run to completion, saving and reloading at every boundary. The reloaded
/// Farm must match a never-reloaded twin. Returns the phases reloaded in.
fn finish_with_reloads(farm: &mut FarmState, catalog: &CatalogDocument) -> BTreeSet<&'static str> {
    let mut twin = farm.clone();
    let mut phases = BTreeSet::new();
    for _ in 0..256 {
        if let Some(phase) = phase(farm) {
            phases.insert(phase);
        }
        *farm = restored(farm);
        assert_eq!(
            serde_json::to_value(&*farm).unwrap(),
            serde_json::to_value(&twin).unwrap()
        );
        let Some(next) = next_time(farm) else {
            return phases;
        };
        apply_elapsed(farm, catalog, next);
        apply_elapsed(&mut twin, catalog, next);
        assert!(
            farm.blocked_resident_tasks.is_empty(),
            "{:?}",
            farm.blocked_resident_tasks
        );
    }
    panic!("work never settled");
}

fn slow_wheat_catalog() -> CatalogDocument {
    let mut catalog = CatalogDocument::default_catalog();
    let wheat = catalog
        .crops
        .iter_mut()
        .find(|crop| crop.item_id == "wheat")
        .unwrap();
    wheat.reference_seconds = 1200;
    catalog
}

fn wheat_chain(id: &str, plot: &str) -> Value {
    json!({"type":"admit_concrete_chain","chain_id":id,"jobs":[
        {"id":"plant","resident_id":RESIDENT,"work":{"type":"plant_crop","plot_id":plot,"crop_id":"wheat"},
         "after":[],"inputs":[{"item_id":"wheat","quantity":1,"source":{"type":"stored"}}]},
        {"id":"harvest","resident_id":RESIDENT,"work":{"type":"harvest_crop","plot_id":plot},
         "after":["plant"],"inputs":[]}
    ]})
}

fn oven_chain(id: &str) -> Value {
    json!({"type":"admit_concrete_chain","chain_id":id,"jobs":[
        {"id":"bake","resident_id":RESIDENT,"work":{"type":"start_oven_recipe","recipe_id":"bread"},
         "after":[],"inputs":[{"item_id":"wheat","quantity":3,"source":{"type":"stored"}}]},
        {"id":"collect","resident_id":RESIDENT,"work":{"type":"collect_oven_job","producer_id":"bake"},
         "after":["bake"],"inputs":[]}
    ]})
}

#[test]
fn wheat_growth_is_an_explicit_wait_without_a_resident_requirement() {
    let catalog = slow_wheat_catalog();
    let mut farm = oven_farm(&catalog);
    admit_chain(&mut farm, &catalog, wheat_chain("wheat", "plot-1"));
    let harvest = waiting_task(&farm);
    let wait = &harvest.steps[0];
    assert!(matches!(
        &wait.work,
        ResidentTaskStepWork::AutonomousWait {
            phase: AutonomousPhase::CropGrowth { crop_id }
        } if crop_id == "wheat"
    ));
    assert!(!wait.requires_resident());
    assert!(
        wait.requirements()
            .iter()
            .all(|declared| declared.requirement != StepRequirement::Resident)
    );
    assert!(
        harvest.steps[1..]
            .iter()
            .all(|step| step.requires_resident())
    );
    // The wait covers exactly the gap between planting and readiness.
    let plant_tail = resident_step_ends(&queue(&farm)[0])
        .last()
        .copied()
        .unwrap();
    assert_eq!(harvest.started_at_ms, plant_tail);
    assert_eq!(
        harvest.ready_at_ms,
        harvest.started_at_ms + wait.duration_ms
    );
}

#[test]
fn wheat_plant_grow_harvest_silo_releases_and_reacquires_the_resident() {
    let catalog = slow_wheat_catalog();
    let mut farm = oven_farm(&catalog);
    let wheat_before = inventory_quantity(&farm, "wheat");
    admit_chain(&mut farm, &catalog, wheat_chain("wheat", "plot-1"));
    let harvest_id = waiting_task(&farm).id.clone();
    let accepted_ends = resident_step_ends(waiting_task(&farm));

    let mut phases = advance_until(&mut farm, &catalog, head_is_wait);
    let view = farm_view(&farm, &catalog);
    let work = &view.resident_work[RESIDENT];
    assert_eq!(work.state, ResidentWorkState::Waiting);
    assert_eq!(work.queue[0].queue_state, ResidentTaskQueueState::Waiting);
    assert!(!work.current_step.as_ref().unwrap().requires_resident);
    assert_eq!(work.current_step.as_ref().unwrap().label, "Wheat growing");
    assert_eq!(work.current_task.as_ref().unwrap().label, "Harvest Wheat");

    // Manual work admitted during growth uses the wait and is queued ahead of it.
    select(&mut farm, &catalog);
    plant(&mut farm, &catalog, "plot-2");
    let tasks = queue(&farm);
    assert_eq!(tasks.len(), 2);
    assert!(
        tasks[0]
            .steps
            .iter()
            .any(|step| matches!(step.work, ResidentTaskStepWork::PlantCrop { .. }))
    );
    assert_eq!(tasks[1].id, harvest_id);
    assert_eq!(
        resident_step_ends(&tasks[1]),
        accepted_ends,
        "accepted times never move"
    );
    let filler_tail = *resident_step_ends(&tasks[0]).last().unwrap();
    assert_eq!(
        tasks[1].started_at_ms, filler_tail,
        "the wait resumes when the filler ends"
    );
    assert!(tasks[1].ready_at_ms >= filler_tail);

    phases.extend(finish_with_reloads(&mut farm, &catalog));
    for phase in ["plant", "wait", "harvest", "deposit"] {
        assert!(
            phases.contains(phase),
            "no reload during {phase}: {phases:?}"
        );
    }
    // Seeds for two plantings spent, one 2-wheat harvest deposited in the Silo.
    assert_eq!(inventory_quantity(&farm, "wheat"), wheat_before - 2 + 2);
    assert_eq!(
        farm.resident_last_harvest_deposit[RESIDENT].completed_at_ms,
        *accepted_ends.iter().rev().nth(1).unwrap(),
        "the Silo deposit happens at its accepted time"
    );
}

#[test]
fn chain_work_admitted_during_growth_also_uses_the_wait() {
    let catalog = slow_wheat_catalog();
    let mut farm = oven_farm(&catalog);
    admit_chain(&mut farm, &catalog, wheat_chain("first", "plot-1"));
    advance_until(&mut farm, &catalog, head_is_wait);
    let accepted_ends = resident_step_ends(waiting_task(&farm));
    admit_chain(
        &mut farm,
        &catalog,
        json!({"type":"admit_concrete_chain","chain_id":"filler","jobs":[
            {"id":"plant","resident_id":RESIDENT,"work":{"type":"plant_crop","plot_id":"plot-2","crop_id":"wheat"},
             "after":[],"inputs":[{"item_id":"wheat","quantity":1,"source":{"type":"stored"}}]}
        ]}),
    );
    let tasks = queue(&farm);
    assert!(
        !tasks[0].steps[0].is_autonomous_wait(),
        "chain filler runs first"
    );
    assert_eq!(resident_step_ends(&tasks[1]), accepted_ends);
    finish_with_reloads(&mut farm, &catalog);
    assert!(
        farm.field_plots
            .iter()
            .filter(|plot| plot.id == "plot-1" || plot.id == "plot-2")
            .all(|plot| plot.crop.is_some() == (plot.id == "plot-2"))
    );
}

#[test]
fn oven_start_bake_collect_barn_releases_and_reacquires_the_resident() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = oven_farm(&catalog);
    admit_chain(&mut farm, &catalog, oven_chain("bread"));
    let collect = waiting_task(&farm);
    assert!(matches!(
        &collect.steps[0].work,
        ResidentTaskStepWork::AutonomousWait {
            phase: AutonomousPhase::OvenBake { recipe_id, .. }
        } if recipe_id == "bread"
    ));
    let collect_id = collect.id.clone();
    let accepted_ends = resident_step_ends(collect);

    let mut phases = advance_until(&mut farm, &catalog, head_is_wait);
    let view = farm_view(&farm, &catalog);
    let work = &view.resident_work[RESIDENT];
    assert_eq!(work.state, ResidentWorkState::Waiting);
    assert_eq!(work.current_step.as_ref().unwrap().label, "Bread baking");

    // Planting takes longer than the default bake: it does not fit and queues after.
    select(&mut farm, &catalog);
    plant(&mut farm, &catalog, "plot-1");
    let tasks = queue(&farm);
    assert_eq!(
        tasks[0].id, collect_id,
        "work that cannot finish in time waits"
    );
    assert_eq!(resident_step_ends(&tasks[0]), accepted_ends);

    phases.extend(finish_with_reloads(&mut farm, &catalog));
    for phase in ["start", "wait", "collect", "deposit"] {
        assert!(
            phases.contains(phase),
            "no reload during {phase}: {phases:?}"
        );
    }
    assert_eq!(
        inventory_quantity(&farm, "bread"),
        1,
        "bread committed to the Barn"
    );
    assert!(farm.oven.queue.is_empty());
}

#[test]
fn work_that_fits_in_a_long_bake_runs_before_collection() {
    let mut catalog = CatalogDocument::default_catalog();
    catalog
        .recipes
        .iter_mut()
        .find(|recipe| recipe.id == "bread")
        .unwrap()
        .reference_seconds = 3000;
    let mut farm = oven_farm(&catalog);
    admit_chain(&mut farm, &catalog, oven_chain("bread"));
    advance_until(&mut farm, &catalog, head_is_wait);
    let collect_id = waiting_task(&farm).id.clone();
    let accepted_ends = resident_step_ends(waiting_task(&farm));

    select(&mut farm, &catalog);
    plant(&mut farm, &catalog, "plot-1");
    let tasks = queue(&farm);
    assert_eq!(
        tasks[1].id, collect_id,
        "the filler is queued ahead of the waiting task"
    );
    assert_eq!(resident_step_ends(&tasks[1]), accepted_ends);

    finish_with_reloads(&mut farm, &catalog);
    assert_eq!(inventory_quantity(&farm, "bread"), 1);
    assert!(
        farm.field_plots
            .iter()
            .find(|plot| plot.id == "plot-1")
            .unwrap()
            .crop
            .is_some()
    );
}
