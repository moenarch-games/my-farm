//! Resident Details read model: current Step phase and predicted timing (#273).
#[path = "acceptance/explicit_chain_fixture.rs"]
mod fixture;
use fixture::oven_farm;
use my_farm_core::{
    CatalogDocument, FarmCommand, FarmState, ResidentStepPhase, ResidentWorkState, apply_command,
    apply_elapsed, farm_view,
};
use serde_json::{Value, json};

const RESIDENT: &str = "man";

#[derive(Debug, Clone, PartialEq)]
struct Predicted {
    task_id: String,
    label: String,
    phase: ResidentStepPhase,
    starts_at_ms: i64,
    ends_at_ms: i64,
}

fn admit_chain(farm: &mut FarmState, catalog: &CatalogDocument, chain: Value) {
    let command: FarmCommand = serde_json::from_value(chain).unwrap();
    let now = farm.last_update_ms;
    let outcome = apply_command(farm, catalog, command, now);
    assert!(outcome.accepted, "chain rejected: {:?}", outcome.error);
}

/// Every queued Step, in order, as the read model predicts it.
fn predicted_schedule(farm: &FarmState, catalog: &CatalogDocument) -> Vec<Predicted> {
    let view = farm_view(farm, catalog);
    view.resident_work[RESIDENT]
        .queue
        .iter()
        .flat_map(|task| {
            task.steps.iter().map(|step| Predicted {
                task_id: task.id.clone(),
                label: step.label.clone(),
                phase: step.phase.clone(),
                starts_at_ms: step.starts_at_ms,
                ends_at_ms: step.ends_at_ms,
            })
        })
        .collect()
}

/// Run the queue to completion through authoritative elapsed simulation,
/// reloading at each boundary, and check every Step becomes current exactly
/// in its predicted window with the matching Resident state.
fn assert_schedule_holds(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
) -> Vec<ResidentStepPhase> {
    let predicted = predicted_schedule(farm, catalog);
    assert!(!predicted.is_empty());
    for pair in predicted.windows(2) {
        if pair[0].task_id == pair[1].task_id {
            assert_eq!(pair[0].ends_at_ms, pair[1].starts_at_ms, "{pair:?}");
        }
        assert!(pair[0].ends_at_ms <= pair[1].starts_at_ms, "{pair:?}");
    }

    let mut seen = 0;
    for _ in 0..256 {
        let view = farm_view(farm, catalog);
        let work = &view.resident_work[RESIDENT];
        let Some(step) = work.current_step.as_ref() else {
            break;
        };
        let task_id = &work.current_task.as_ref().unwrap().id;
        let current = Predicted {
            task_id: task_id.clone(),
            label: step.label.clone(),
            phase: step.phase.clone(),
            starts_at_ms: step.starts_at_ms,
            ends_at_ms: step.ends_at_ms,
        };
        if seen == 0 || predicted[seen - 1] != current {
            // Zero-length Steps complete within the same elapsed call.
            while predicted[seen] != current
                && predicted[seen].starts_at_ms == predicted[seen].ends_at_ms
            {
                seen += 1;
            }
            assert_eq!(predicted[seen], current, "step {seen}");
            seen += 1;
        }
        assert_eq!(
            work.current_task.as_ref().unwrap().steps[0],
            *step,
            "current step is the head of the current task"
        );
        let expected_state = if step.phase == ResidentStepPhase::AutonomousWait {
            ResidentWorkState::Waiting
        } else if step.walk_duration_ms > 0
            && view.last_update_ms < step.starts_at_ms + step.walk_duration_ms
        {
            ResidentWorkState::Walking
        } else {
            ResidentWorkState::Working
        };
        assert_eq!(work.state, expected_state, "{current:?}");

        // Step into the walk, then to the predicted end.
        let walk_end = step.starts_at_ms + step.walk_duration_ms;
        let next = if view.last_update_ms < walk_end && walk_end < step.ends_at_ms {
            walk_end
        } else {
            step.ends_at_ms.max(view.last_update_ms + 1)
        };
        *farm = serde_json::from_str(&serde_json::to_string(farm).unwrap()).unwrap();
        apply_elapsed(farm, catalog, next);
        assert!(farm.blocked_resident_tasks.is_empty());
    }
    assert!(
        predicted[seen..]
            .iter()
            .all(|step| step.starts_at_ms == step.ends_at_ms),
        "every predicted step ran"
    );
    predicted.into_iter().map(|step| step.phase).collect()
}

#[test]
fn crop_flow_predicts_walk_work_wait_and_collection_timing() {
    let mut catalog = CatalogDocument::default_catalog();
    catalog
        .crops
        .iter_mut()
        .find(|crop| crop.item_id == "wheat")
        .unwrap()
        .reference_seconds = 1200;
    let mut farm = oven_farm(&catalog);
    admit_chain(
        &mut farm,
        &catalog,
        json!({"type":"admit_concrete_chain","chain_id":"wheat","jobs":[
            {"id":"plant","resident_id":RESIDENT,"work":{"type":"plant_crop","plot_id":"plot-1","crop_id":"wheat"},
             "after":[],"inputs":[{"item_id":"wheat","quantity":1,"source":{"type":"stored"}}]},
            {"id":"harvest","resident_id":RESIDENT,"work":{"type":"harvest_crop","plot_id":"plot-1"},
             "after":["plant"],"inputs":[]}
        ]}),
    );
    let phases = assert_schedule_holds(&mut farm, &catalog);
    for phase in [
        ResidentStepPhase::ActiveWork,
        ResidentStepPhase::AutonomousWait,
        ResidentStepPhase::CollectionDeposit,
    ] {
        assert!(phases.contains(&phase), "{phase:?} missing: {phases:?}");
    }
}

#[test]
fn oven_flow_predicts_start_bake_collect_and_deposit_timing() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = oven_farm(&catalog);
    admit_chain(
        &mut farm,
        &catalog,
        json!({"type":"admit_concrete_chain","chain_id":"bread","jobs":[
            {"id":"bake","resident_id":RESIDENT,"work":{"type":"start_oven_recipe","recipe_id":"bread"},
             "after":[],"inputs":[{"item_id":"wheat","quantity":3,"source":{"type":"stored"}}]},
            {"id":"collect","resident_id":RESIDENT,"work":{"type":"collect_oven_job","producer_id":"bake"},
             "after":["bake"],"inputs":[]}
        ]}),
    );
    let phases = assert_schedule_holds(&mut farm, &catalog);
    let wait = phases
        .iter()
        .position(|phase| *phase == ResidentStepPhase::AutonomousWait)
        .expect("bake is an autonomous wait");
    assert!(phases[..wait].contains(&ResidentStepPhase::ActiveWork));
    assert!(phases[wait + 1..].contains(&ResidentStepPhase::CollectionDeposit));
}
