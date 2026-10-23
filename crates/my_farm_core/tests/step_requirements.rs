//! Step-scoped resource requirements (#270, first slice of #172).
use my_farm_core::{
    CatalogDocument, FarmCommand, FarmState, ReservedWorkTarget, ResidentTaskStepWork,
    StepRequirement, StepRequirementSpan, ToolKind, apply_command, apply_elapsed,
    claimed_work_targets, new_farm,
};

fn sweep_plant(farm: &mut FarmState, catalog: &CatalogDocument, plots: &[&str]) {
    let outcome = apply_command(
        farm,
        catalog,
        FarmCommand::SweepPlant {
            crop_id: "wheat".to_owned(),
            plot_ids: plots.iter().map(|plot| (*plot).to_owned()).collect(),
        },
        0,
    );
    assert!(outcome.accepted, "Command rejected: {:?}", outcome.error);
}

fn plot(id: &str) -> ReservedWorkTarget {
    ReservedWorkTarget::FieldPlot {
        plot_id: id.to_owned(),
    }
}

fn claims(farm: &FarmState) -> Vec<ReservedWorkTarget> {
    claimed_work_targets(farm).into_iter().cloned().collect()
}

fn restored(farm: &FarmState) -> FarmState {
    serde_json::from_str(&serde_json::to_string(farm).unwrap()).unwrap()
}

#[test]
fn steps_declare_only_the_resources_they_need() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    sweep_plant(&mut farm, &catalog, &["plot-1"]);
    let task = &farm.resident_task_queues["woman"][0];
    for step in &task.steps {
        let declared = step.requirements();
        assert_eq!(declared[0].requirement, StepRequirement::Resident);
        assert_eq!(declared[0].span, StepRequirementSpan::WalkAndWork);
        let tools: Vec<_> = declared
            .iter()
            .filter_map(|d| match d.requirement {
                StepRequirement::Tool { tool_kind } => Some(tool_kind),
                _ => None,
            })
            .collect();
        let targets: Vec<_> = declared
            .iter()
            .filter_map(|d| match &d.requirement {
                StepRequirement::WorkTarget { target } => Some(target.clone()),
                _ => None,
            })
            .collect();
        match &step.work {
            ResidentTaskStepWork::PlantCrop { .. } => {
                assert_eq!(tools, vec![ToolKind::Hoe]);
                assert_eq!(targets, vec![plot("plot-1")]);
            }
            // Pickup/return only visit shared Structures: no Tool, no exclusive target.
            _ => {
                assert!(tools.is_empty(), "{:?} declares a Tool", step.work);
                assert!(targets.is_empty(), "{:?} claims a target", step.work);
                assert!(
                    declared
                        .iter()
                        .any(|d| matches!(d.requirement, StepRequirement::Structure { .. }))
                );
            }
        }
    }
}

#[test]
fn requirement_windows_follow_step_boundaries_on_farm_time() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    sweep_plant(&mut farm, &catalog, &["plot-1", "plot-2"]);
    let task = &farm.resident_task_queues["woman"][0];
    let windows = task.step_requirement_windows();
    let mut previous_end = task.started_at_ms;
    for (index, step) in task.steps.iter().enumerate() {
        let step_windows: Vec<_> = windows
            .iter()
            .filter(|(i, _)| *i == index)
            .map(|(_, window)| window)
            .collect();
        let resident = step_windows
            .iter()
            .find(|w| w.requirement == StepRequirement::Resident)
            .unwrap();
        // Resident time is reserved exactly for this Step: contiguous, walk + work.
        assert_eq!(resident.begins_at_ms, previous_end);
        assert_eq!(
            resident.ends_at_ms - resident.begins_at_ms,
            step.duration_ms
        );
        // Tools and targets begin only on arrival, after walking.
        for window in step_windows
            .iter()
            .filter(|w| w.requirement != StepRequirement::Resident)
        {
            assert_eq!(
                window.begins_at_ms,
                resident.begins_at_ms + step.walk_duration_ms
            );
            assert_eq!(window.ends_at_ms, resident.ends_at_ms);
        }
        previous_end = resident.ends_at_ms;
    }
    assert!(
        windows.iter().any(|(_, w)| w.requirement
            == StepRequirement::WorkTarget {
                target: plot("plot-2")
            }
            && w.begins_at_ms > task.started_at_ms),
        "later work target is not reserved from task start"
    );
}

#[test]
fn work_target_claim_is_released_at_its_step_boundary() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    sweep_plant(&mut farm, &catalog, &["plot-1", "plot-2"]);
    assert_eq!(claims(&farm), vec![plot("plot-1"), plot("plot-2")]);
    let windows = farm.resident_task_queues["woman"][0].step_requirement_windows();
    let first_plant_end = windows
        .iter()
        .find(|(_, w)| {
            w.requirement
                == StepRequirement::WorkTarget {
                    target: plot("plot-1"),
                }
        })
        .unwrap()
        .1
        .ends_at_ms;
    apply_elapsed(&mut farm, &catalog, first_plant_end - 1);
    assert_eq!(claims(&farm), vec![plot("plot-1"), plot("plot-2")]);
    apply_elapsed(&mut farm, &catalog, first_plant_end);
    assert!(farm.field_plots[0].crop.is_some());
    assert_eq!(claims(&farm), vec![plot("plot-2")]);
    assert!(!farm.resident_task_queues["woman"].is_empty());
}

#[test]
fn save_reload_preserves_step_requirements_and_execution() {
    let catalog = CatalogDocument::default_catalog();
    let mut direct = new_farm(0, &catalog);
    sweep_plant(&mut direct, &catalog, &["plot-1", "plot-2"]);
    apply_elapsed(&mut direct, &catalog, 1_500);
    let mut reload = restored(&direct);
    let windows = |farm: &FarmState| {
        farm.resident_task_queues["woman"]
            .iter()
            .map(|task| task.step_requirement_windows())
            .collect::<Vec<_>>()
    };
    assert_eq!(windows(&direct), windows(&reload));
    assert_eq!(claims(&direct), claims(&reload));
    for time in (1_600..=120_000).step_by(100) {
        apply_elapsed(&mut direct, &catalog, time);
        apply_elapsed(&mut reload, &catalog, time);
        assert_eq!(windows(&direct), windows(&reload), "diverged at {time}");
    }
    assert!(direct.resident_task_queues["woman"].is_empty());
    assert_eq!(
        serde_json::to_value(&direct).unwrap(),
        serde_json::to_value(&reload).unwrap()
    );
}

#[test]
fn step_without_its_declared_tool_blocks_at_the_boundary() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    sweep_plant(&mut farm, &catalog, &["plot-1"]);
    // The zero-walk Hoe checkout completed at admission. Saved-state fixture:
    // custody is lost (Hoe back at the Farmhouse) before the Plant Step boundary.
    let inventory = farm.resident_inventories.get_mut("woman").unwrap();
    assert_eq!(inventory.tools.remove(&ToolKind::Hoe), Some(1));
    inventory.tool_sources.remove(&ToolKind::Hoe);
    *farm.farmhouse_tool_stock.entry(ToolKind::Hoe).or_default() += 1;
    for time in (100..=60_000).step_by(100) {
        apply_elapsed(&mut farm, &catalog, time);
    }
    assert_eq!(farm.blocked_resident_tasks["woman"].reason, "missing_tools");
    assert!(matches!(
        farm.resident_task_queues["woman"][0].steps[0].work,
        ResidentTaskStepWork::PlantCrop { .. }
    ));
    assert!(farm.field_plots[0].crop.is_none());
    assert_eq!(claims(&farm), vec![plot("plot-1")]);
}
