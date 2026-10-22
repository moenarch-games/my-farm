//! Autonomous elapsed phases release the Resident (#271, ADR 0027).
//!
//! A task whose next Resident Step waits on Crop growth or an Oven bake starts
//! with an explicit `AutonomousWait` Step that has no Resident requirement.
//! Newly admitted work may run during that wait only when all of it, including
//! walking, deposits and Tool returns, finishes before the waiting task needs
//! the Resident again. It is then queued ahead of the waiting task. Accepted
//! times never get later; otherwise the new work queues after, as before.
use super::*;
use crate::AutonomousPhase;

/// Prepend a wait covering the Resident's idle gap before `task`'s first Step.
pub(super) fn prepend_wait(
    task: &mut ResidentTask,
    idle_from_ms: i64,
    target: ReservedWorkTarget,
    phase: AutonomousPhase,
) {
    let gap = task.started_at_ms.saturating_sub(idle_from_ms);
    if gap <= 0 {
        return;
    }
    task.steps.insert(
        0,
        ResidentTaskStep {
            reserved_work_target: target,
            work: ResidentTaskStepWork::AutonomousWait { phase },
            approach_tile: None,
            walk_path: Vec::new(),
            walk_duration_ms: 0,
            work_duration_ms: gap,
            duration_ms: gap,
        },
    );
    task.ready_at_ms = task.started_at_ms;
    task.started_at_ms = idle_from_ms;
}

pub(super) fn starts_with_wait(task: &ResidentTask) -> bool {
    task.steps
        .first()
        .is_some_and(ResidentTaskStep::is_autonomous_wait)
}

/// Set a leading wait to run from `start_ms` until `work_start_ms`.
pub(super) fn set_wait_window(task: &mut ResidentTask, start_ms: i64, work_start_ms: i64) {
    let duration = work_start_ms.saturating_sub(start_ms).max(0);
    task.started_at_ms = start_ms;
    task.ready_at_ms = start_ms.saturating_add(duration);
    if let Some(wait) = task.steps.first_mut() {
        wait.work_duration_ms = duration;
        wait.duration_ms = duration;
    }
}

/// The wait ends only once its phase is actually running (or already done).
/// Readiness itself stays gated at the Harvest/Collect Step as before.
pub(super) fn phase_started(farm: &FarmState, step: &ResidentTaskStep) -> bool {
    let ResidentTaskStepWork::AutonomousWait { phase } = &step.work else {
        return true;
    };
    match (phase, &step.reserved_work_target) {
        (AutonomousPhase::CropGrowth { crop_id }, ReservedWorkTarget::FieldPlot { plot_id }) => {
            farm.field_plots
                .iter()
                .find(|plot| plot.id == *plot_id)
                .and_then(|plot| plot.crop.as_ref())
                .is_some_and(|crop| crop.item_id == *crop_id)
        }
        (AutonomousPhase::OvenBake { job_id, .. }, _) => farm
            .oven
            .queue
            .iter()
            .any(|job| job.id == *job_id && job.status == OvenJobStatus::Producing),
        _ => true,
    }
}

/// An earlier task running long shortens a following wait instead of moving
/// the waiting task's Resident Steps.
pub(super) fn absorb_predecessor_overrun(farm: &mut FarmState) {
    for queue in farm.resident_task_queues.values_mut() {
        for index in 1..queue.len() {
            let release = resident_task_tail_ready_at(&queue[index - 1]);
            let task = &mut queue[index];
            if starts_with_wait(task) && task.started_at_ms < release && release <= task.ready_at_ms
            {
                let work_start = task.ready_at_ms;
                set_wait_window(task, release, work_start);
            }
        }
    }
}

/// For every Resident with exactly one newly appended task, try to fit it
/// ahead of a waiting task.
pub(super) fn fit_new_tasks(before: &FarmState, after: &mut FarmState, catalog: &CatalogDocument) {
    let residents = after
        .resident_task_queues
        .keys()
        .cloned()
        .collect::<Vec<_>>();
    for resident in residents {
        let known = before
            .resident_task_queues
            .get(&resident)
            .map(|queue| {
                queue
                    .iter()
                    .map(|task| task.id.as_str())
                    .collect::<BTreeSet<_>>()
            })
            .unwrap_or_default();
        let queue = &after.resident_task_queues[&resident];
        let fresh = queue
            .iter()
            .filter(|task| !known.contains(task.id.as_str()))
            .collect::<Vec<_>>();
        let [task] = fresh.as_slice() else {
            continue;
        };
        if queue.last().map(|last| &last.id) != Some(&task.id) {
            continue;
        }
        let task_id = task.id.clone();
        if let Some(fitted) = fit_before_wait(before, after, catalog, &resident, &task_id) {
            *after = fitted;
        }
    }
}

/// Move the newly appended `task_id` ahead of the first waiting task it fully
/// fits in front of. `before` is the Farm before the task was admitted.
pub(super) fn fit_before_wait(
    before: &FarmState,
    after: &FarmState,
    catalog: &CatalogDocument,
    resident: &str,
    task_id: &str,
) -> Option<FarmState> {
    let accepted = before.resident_task_queues.get(resident)?;
    let new_task = after
        .resident_task_queues
        .get(resident)?
        .last()
        .filter(|task| task.id == task_id)?;
    if new_task
        .steps
        .iter()
        .any(ResidentTaskStep::is_autonomous_wait)
    {
        return None;
    }
    let base = resident_task_reorder_work_steps(new_task);
    if base.is_empty() {
        return None;
    }
    (0..accepted.len())
        .filter(|index| starts_with_wait(&accepted[*index]))
        .find_map(|index| fit_at(before, after, catalog, resident, new_task, &base, index))
}

fn fit_at(
    before: &FarmState,
    after: &FarmState,
    catalog: &CatalogDocument,
    resident: &str,
    new_task: &ResidentTask,
    base: &[ResidentTaskStep],
    index: usize,
) -> Option<FarmState> {
    let accepted = &before.resident_task_queues[resident];
    let mut candidate = after.clone();
    candidate
        .resident_task_queues
        .insert(resident.to_owned(), accepted[..index].to_vec());
    let held = projected_resident_inventory(&candidate, catalog, resident);
    let start_tile = projected_resident_start_tile(&candidate, resident);
    let selected = std::mem::replace(&mut candidate.selected_resident_id, resident.to_owned());
    let now_ms = candidate.last_update_ms;
    let planned = plan_resident_work_after_queue(
        &mut candidate,
        catalog,
        now_ms,
        new_task.kind.clone(),
        base.to_vec(),
        false,
    )
    .ok()?;
    candidate.selected_resident_id = selected;
    let fitted = ResidentTask {
        stop_requested: false,
        id: new_task.id.clone(),
        kind: planned.kind,
        steps: planned.steps,
        started_at_ms: planned.started_at_ms,
        ready_at_ms: planned.ready_at_ms,
    };

    // The fitted work must hand the Resident back exactly as it found them.
    let mut released = held.clone();
    for step in &fitted.steps {
        apply_projected_step(&candidate, catalog, &mut released, step).ok()?;
    }
    if released.items != held.items || released.tools != held.tools {
        return None;
    }

    // The waiting task's next Resident Step keeps its approach and end time; only
    // its walk now starts where the fitted work ends.
    let mut waiting = accepted[index].clone();
    let next = waiting.steps.get(1)?;
    let approach = next.approach_tile.clone()?;
    let next_end = waiting.ready_at_ms.checked_add(next.duration_ms.max(0))?;
    let from = fitted
        .steps
        .iter()
        .rev()
        .find_map(|step| step.approach_tile.clone())
        .unwrap_or(start_tile);
    let path = find_walk_path(&candidate, &from, &approach)?;
    let walk = (path.len() as i64).checked_mul(RESIDENT_FIELD_WORK_WALKED_TILE_DURATION_MS)?;
    let next_duration = walk.checked_add(next.work_duration_ms)?;
    let work_start = next_end.checked_sub(next_duration)?;
    let fitted_end = resident_task_tail_ready_at(&fitted);
    if fitted_end > work_start {
        return None;
    }
    let next = &mut waiting.steps[1];
    next.walk_path = path;
    next.walk_duration_ms = walk;
    next.duration_ms = next_duration;
    set_wait_window(&mut waiting, fitted_end, work_start);

    let fitted_steps = fitted.steps.len();
    let mut queue = accepted[..index].to_vec();
    queue.push(fitted);
    queue.push(waiting);
    queue.extend(accepted[index + 1..].iter().cloned());
    concrete_chain::validate_queue_dependencies(&candidate, resident, &queue).ok()?;
    candidate
        .resident_task_queues
        .insert(resident.to_owned(), queue);
    for job in candidate
        .concrete_chains
        .values_mut()
        .flat_map(|chain| chain.jobs.values_mut())
        .filter(|job| job.task_ids.contains(&new_task.id))
    {
        job.initial_step_count = fitted_steps;
    }

    // Dependency and Tool calendars must converge without delaying any accepted Step.
    concrete_chain::reconcile(&mut candidate).ok()?;
    reconcile_tool_times(&mut candidate).ok()?;
    keeps_accepted_times(before, &candidate).then_some(candidate)
}

fn keeps_accepted_times(before: &FarmState, candidate: &FarmState) -> bool {
    before
        .resident_task_queues
        .iter()
        .flat_map(|(resident, queue)| queue.iter().map(move |task| (resident, task)))
        .all(|(resident, accepted)| {
            let Some(task) = candidate
                .resident_task_queues
                .get(resident)
                .and_then(|queue| queue.iter().find(|task| task.id == accepted.id))
            else {
                return false;
            };
            let accepted_ends = resident_step_ends(accepted);
            let ends = resident_step_ends(task);
            accepted_ends.len() == ends.len()
                && ends
                    .iter()
                    .zip(&accepted_ends)
                    .all(|(end, accepted_end)| end <= accepted_end)
        })
}

/// End times of the task's Resident-required Steps.
fn resident_step_ends(task: &ResidentTask) -> Vec<i64> {
    let mut at = task.ready_at_ms;
    let mut ends = Vec::new();
    for (index, step) in task.steps.iter().enumerate() {
        if index > 0 {
            at = at.saturating_add(resident_task_step_duration_ms(step));
        }
        if step.requires_resident() {
            ends.push(at);
        }
    }
    ends
}
