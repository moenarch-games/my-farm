//! Travel-distance productivity without Resident-vs-Resident blocking (#272, #172).
use std::collections::BTreeSet;

use my_farm_core::{
    CatalogDocument, FarmCommand, FarmState, PlantedCrop, ResidentTask, ResidentTaskStepWork,
    StructureTarget, Tile, ToolKind, apply_command, apply_elapsed, inventory_quantity, new_farm,
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

fn harvest_ready_plot_1(farm: &mut FarmState, catalog: &CatalogDocument) {
    farm.field_plots[0].crop = Some(PlantedCrop {
        item_id: "wheat".into(),
        planted_at_ms: 0,
        ready_at_ms: 0,
    });
    accepted(
        farm,
        catalog,
        FarmCommand::HarvestCrop {
            plot_id: "plot-1".into(),
        },
    );
}

fn walked_tiles(task: &ResidentTask) -> BTreeSet<(i32, i32)> {
    task.steps
        .iter()
        .flat_map(|step| step.walk_path.iter())
        .map(|tile| (tile.x, tile.y))
        .collect()
}

fn walk_ms(task: &ResidentTask) -> i64 {
    task.steps.iter().map(|step| step.walk_duration_ms).sum()
}

/// Predicted Farm time the whole task (including deposit and Tool return) completes.
/// `ready_at_ms` marks the end of the first Step; later Steps follow back to back.
fn finish(task: &ResidentTask) -> i64 {
    task.ready_at_ms
        + task.steps[1..]
            .iter()
            .map(|step| step.duration_ms)
            .sum::<i64>()
}

fn step_end(task: &ResidentTask, matches: impl Fn(&ResidentTaskStepWork) -> bool) -> i64 {
    let mut at = task.ready_at_ms;
    for (index, step) in task.steps.iter().enumerate() {
        if index > 0 {
            at += step.duration_ms;
        }
        if matches(&step.work) {
            return at;
        }
    }
    panic!("Step missing");
}

fn walk_len(task: &ResidentTask) -> usize {
    task.steps.iter().map(|step| step.walk_path.len()).sum()
}

fn inside(tile: &Tile, origin: (i32, i32), size: (i32, i32)) -> bool {
    tile.x >= origin.0
        && tile.x < origin.0 + size.0
        && tile.y >= origin.1
        && tile.y < origin.1 + size.1
}

/// Runs only through `apply_elapsed` and returns the Farm time each Resident's queue drained.
fn drain(farm: &mut FarmState, catalog: &CatalogDocument) -> Vec<(String, i64)> {
    let mut drained = Vec::new();
    for time in (100..=300_000).step_by(100) {
        apply_elapsed(farm, catalog, time);
        assert!(
            farm.blocked_resident_tasks.is_empty(),
            "Crossing or shared work became blocked: {:?}",
            farm.blocked_resident_tasks
        );
        for (resident, queue) in &farm.resident_task_queues {
            if queue.is_empty() && !drained.iter().any(|(id, _)| id == resident) {
                drained.push((resident.clone(), time));
            }
        }
        if drained.len() == farm.residents.len() {
            return drained;
        }
    }
    panic!("Fixture failed to finish within bounded Farm time");
}

fn drained_at(drained: &[(String, i64)], resident: &str) -> i64 {
    drained.iter().find(|(id, _)| id == resident).unwrap().1
}

#[test]
fn shorter_deposit_route_completes_the_same_harvest_earlier() {
    let catalog = CatalogDocument::default_catalog();
    let mut far = new_farm(0, &catalog);
    let mut near = new_farm(0, &catalog);
    // Same Farm, same command; only the Silo sits next to the Field Plots.
    accepted(
        &mut near,
        &catalog,
        FarmCommand::MoveStructure {
            target: StructureTarget::Silo,
            tile: Tile::new(4, 0),
        },
    );
    harvest_ready_plot_1(&mut far, &catalog);
    harvest_ready_plot_1(&mut near, &catalog);

    let far_task = far.resident_task_queues["woman"][0].clone();
    let near_task = near.resident_task_queues["woman"][0].clone();
    let work = |task: &ResidentTask| -> Vec<_> {
        task.steps
            .iter()
            .map(|step| (step.work.clone(), step.work_duration_ms))
            .collect()
    };
    assert_eq!(work(&far_task), work(&near_task), "Only travel may differ");
    assert!(walk_len(&near_task) < walk_len(&far_task));
    // Walking is Farm time: the predicted finish differs by exactly the walk difference.
    assert_eq!(
        finish(&far_task) - finish(&near_task),
        walk_ms(&far_task) - walk_ms(&near_task)
    );
    assert!(finish(&near_task) < finish(&far_task));

    // The authoritative elapsed simulation honours the same schedule.
    let near_done = drained_at(&drain(&mut near, &catalog), "woman");
    let far_done = drained_at(&drain(&mut far, &catalog), "woman");
    assert!(near_done < far_done);
    assert!(near_done >= finish(&near_task) && near_done < finish(&near_task) + 100);
    assert!(far_done >= finish(&far_task) && far_done < finish(&far_task) + 100);
    assert_eq!(
        inventory_quantity(&near, "wheat"),
        inventory_quantity(&far, "wheat")
    );
}

#[test]
fn other_residents_never_block_or_reroute_a_path() {
    let catalog = CatalogDocument::default_catalog();
    let mut solo = new_farm(0, &catalog);
    select(&mut solo, &catalog, "man");
    plant(&mut solo, &catalog, "plot-3");
    let solo_task = solo.resident_task_queues["man"][0].clone();

    // The Woman stands on the Man's route and walks the same tiles at the same time.
    let mut crowded = new_farm(0, &catalog);
    let on_route = solo_task
        .steps
        .iter()
        .find_map(|step| step.walk_path.get(1).cloned())
        .expect("route has tiles");
    crowded
        .resident_locations
        .insert("woman".to_owned(), on_route.clone());
    select(&mut crowded, &catalog, "man");
    plant(&mut crowded, &catalog, "plot-3");
    let crowded_task = crowded.resident_task_queues["man"][0].clone();
    assert_eq!(
        crowded_task.steps, solo_task.steps,
        "Resident became a blocker"
    );
    assert_eq!(crowded_task.ready_at_ms, solo_task.ready_at_ms);
    assert!(walked_tiles(&crowded_task).contains(&(on_route.x, on_route.y)));

    // Queued Woman work through those tiles does not invalidate or delay the Man either.
    select(&mut crowded, &catalog, "woman");
    harvest_ready_plot_1(&mut crowded, &catalog);
    assert_eq!(crowded.resident_task_queues["man"][0], crowded_task);
    let drained = drain(&mut crowded, &catalog);
    assert!(drained_at(&drained, "man") >= finish(&crowded_task));
    assert!(drained_at(&drained, "man") < finish(&crowded_task) + 100);
}

#[test]
fn structures_still_block_and_work_uses_approach_tiles() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    harvest_ready_plot_1(&mut farm, &catalog);
    let task = &farm.resident_task_queues["woman"][0];
    let silo = (farm.silo_tile.x, farm.silo_tile.y);
    for step in &task.steps {
        for tile in &step.walk_path {
            assert!(!inside(tile, (8, 8), (2, 2)), "walked through Farmhouse");
            assert!(!inside(tile, silo, (2, 2)), "walked through Silo");
        }
        if matches!(step.work, ResidentTaskStepWork::DepositItems { .. }) {
            let approach = step.approach_tile.as_ref().expect("Silo approach tile");
            assert!(!inside(approach, silo, (2, 2)));
            assert_eq!(step.walk_path.last(), Some(approach));
        }
    }

    // Moving a Structure onto that route makes the Resident walk around it.
    let route = task.steps[0].walk_path.clone();
    let blocked = route[route.len() / 2].clone();
    let mut detour = new_farm(0, &catalog);
    accepted(
        &mut detour,
        &catalog,
        FarmCommand::MoveStructure {
            target: StructureTarget::Barn,
            tile: blocked.clone(),
        },
    );
    harvest_ready_plot_1(&mut detour, &catalog);
    let detour_route = &detour.resident_task_queues["woman"][0].steps[0].walk_path;
    assert_ne!(detour_route, &route);
    assert_eq!(detour_route.last(), route.last());
    for tile in detour_route {
        assert!(
            !inside(tile, (blocked.x, blocked.y), (2, 2)),
            "walked through Barn"
        );
    }
}

#[test]
fn two_residents_cross_the_same_tiles_while_sharing_one_hoe() {
    let catalog = CatalogDocument::default_catalog();
    let mut farm = new_farm(0, &catalog);
    assert_eq!(farm.farmhouse_tool_stock[&ToolKind::Hoe], 1);
    plant(&mut farm, &catalog, "plot-1");
    select(&mut farm, &catalog, "man");
    plant(&mut farm, &catalog, "plot-2");
    let woman = farm.resident_task_queues["woman"][0].clone();
    let man = farm.resident_task_queues["man"][0].clone();
    let shared: Vec<_> = walked_tiles(&woman)
        .intersection(&walked_tiles(&man))
        .copied()
        .collect();
    assert!(shared.len() >= 3, "routes do not overlap: {shared:?}");

    // Scarcity is the Hoe, not the path: the Man waits only for its physical return.
    let returned = step_end(&woman, |work| {
        matches!(work, ResidentTaskStepWork::ReturnTools { .. })
    });
    let checked_out = step_end(&man, |work| {
        matches!(work, ResidentTaskStepWork::PickupTools { .. })
    });
    assert!(checked_out >= returned, "Hoe checkout overlaps custody");

    let mut held_together = false;
    for time in (100..=300_000).step_by(100) {
        apply_elapsed(&mut farm, &catalog, time);
        assert!(farm.blocked_resident_tasks.is_empty());
        let holders = farm
            .resident_inventories
            .values()
            .filter(|inventory| inventory.tools.get(&ToolKind::Hoe).copied().unwrap_or(0) > 0)
            .count();
        held_together |= holders > 1;
        if farm.resident_task_queues.values().all(Vec::is_empty) {
            break;
        }
    }
    assert!(!held_together, "one Hoe held by two Residents");
    assert!(farm.resident_task_queues.values().all(Vec::is_empty));
    assert!(farm.field_plots[..2].iter().all(|plot| plot.crop.is_some()));
    assert_eq!(farm.farmhouse_tool_stock[&ToolKind::Hoe], 1);
}
