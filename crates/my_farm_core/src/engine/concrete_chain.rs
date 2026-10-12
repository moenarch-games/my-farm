//! Admission projects the existing executor into a disposable snapshot. Only
//! concrete tasks and immutable commitments cross back into authoritative state.
use super::*;
use crate::{
    ConcreteChain, ConcreteInput, ConcreteInputSource, ConcreteJob, ConcreteJobRequest,
    ConcreteRecipeTerms, ConcreteWork, RecipeDef,
};

fn tail(task: &ResidentTask) -> Result<i64, CommandError> {
    task.steps
        .iter()
        .skip(1)
        .try_fold(task.ready_at_ms, |at, step| {
            at.checked_add(resident_task_step_duration_ms(step))
                .ok_or_else(|| CommandError::new("dependency timing overflow"))
        })
}
fn task(farm: &FarmState, resident: &str, id: &str) -> Option<ResidentTask> {
    farm.resident_task_queues
        .get(resident)?
        .iter()
        .find(|task| task.id == id)
        .cloned()
}
fn job_end(farm: &FarmState, job: &ConcreteJob) -> Result<i64, CommandError> {
    job.task_ids
        .iter()
        .filter_map(|id| task(farm, &job.resident_id, id))
        .try_fold(farm.last_update_ms, |at, task| Ok(at.max(tail(&task)?)))
}
fn producer<'a>(
    farm: &'a FarmState,
    chain: &str,
    id: &str,
) -> Result<&'a ConcreteJob, CommandError> {
    farm.concrete_chains
        .get(chain)
        .and_then(|chain| chain.jobs.get(id))
        .ok_or_else(|| CommandError::new("unknown producer dependency"))
}
fn source_key(
    farm: &FarmState,
    chain: &str,
    input: &ConcreteInput,
) -> Result<Option<(String, String)>, CommandError> {
    let id = match &input.source {
        ConcreteInputSource::Stored => return Ok(None),
        ConcreteInputSource::ProducerOutput { chain_id, job_id } => {
            let job = producer(farm, chain_id.as_deref().unwrap_or(chain), job_id)?;
            if let Some(id) = &job.production_job_id {
                format!("oven:{id}")
            } else {
                format!(
                    "task:{}",
                    job.task_ids
                        .first()
                        .ok_or_else(|| CommandError::new("producer has no committed task"))?
                )
            }
        }
        ConcreteInputSource::CommittedTaskOutput {
            resident_id,
            task_id,
        } => {
            // Completed records may still be needed to resolve an earlier claim.
            let oven = task(farm, resident_id, task_id)
                .and_then(|task| {
                    task.steps.iter().find_map(|step| match &step.work {
                        ResidentTaskStepWork::CollectOvenJob { job_id, .. } => Some(job_id.clone()),
                        _ => None,
                    })
                })
                .or_else(|| {
                    farm.concrete_chains
                        .values()
                        .flat_map(|chain| chain.jobs.values())
                        .find(|job| {
                            job.resident_id == *resident_id && job.task_ids.contains(task_id)
                        })
                        .and_then(|job| job.production_job_id.clone())
                });
            oven.map(|id| format!("oven:{id}"))
                .unwrap_or_else(|| format!("task:{task_id}"))
        }
    };
    Ok(Some((id, input.item_id.clone())))
}

fn input_totals(inputs: &[ConcreteInput]) -> Result<BTreeMap<String, u32>, CommandError> {
    let mut totals = BTreeMap::<String, u32>::new();
    for input in inputs {
        if input.quantity == 0 {
            return Err(CommandError::new("input quantity must be positive"));
        }
        let value = totals.entry(input.item_id.clone()).or_default();
        *value = value
            .checked_add(input.quantity)
            .ok_or_else(|| CommandError::new("input quantity overflow"))?;
    }
    Ok(totals)
}
fn expect_inputs(inputs: &[ConcreteInput], required: &[ItemStack]) -> Result<(), CommandError> {
    let expected = required
        .iter()
        .map(|item| (item.item_id.clone(), item.quantity))
        .collect::<BTreeMap<_, _>>();
    if input_totals(inputs)? != expected {
        return Err(CommandError::new(
            "input quantities do not match accepted work",
        ));
    }
    Ok(())
}
/// Existing recipe authority, with only this committed job's accepted terms.
pub(super) fn recipe(
    farm: &FarmState,
    catalog: &CatalogDocument,
    job_id: &str,
    recipe_id: &str,
) -> Option<RecipeDef> {
    farm.concrete_chains
        .values()
        .flat_map(|chain| chain.jobs.values())
        .find(|job| {
            job.production_job_id.as_deref() == Some(job_id)
                && matches!(job.work, ConcreteWork::StartOvenRecipe { .. })
        })
        .and_then(|job| job.recipe_terms.as_ref())
        .map(|terms| terms.recipe.clone())
        .or_else(|| catalog.recipe(recipe_id).cloned())
}
pub(super) fn duration(
    farm: &FarmState,
    catalog: &CatalogDocument,
    job_id: &str,
    recipe: &RecipeDef,
) -> i64 {
    farm.concrete_chains
        .values()
        .flat_map(|chain| chain.jobs.values())
        .find(|job| {
            job.production_job_id.as_deref() == Some(job_id)
                && matches!(job.work, ConcreteWork::StartOvenRecipe { .. })
        })
        .and_then(|job| job.recipe_terms.as_ref())
        .map(|terms| terms.duration_ms)
        .unwrap_or_else(|| scaled_duration_ms(recipe.reference_seconds, catalog.balance.time_scale))
}
fn forecast(
    farm: &FarmState,
    catalog: &CatalogDocument,
    at: i64,
) -> Result<FarmState, CommandError> {
    // The loop executes at most the already admitted steps plus their physical
    // idle cleanup. It does not search for assignments or introduce work goals.
    validate_tool_timing(farm)?;
    let mut projection = farm.clone();
    complete_resident_tasks(&mut projection, catalog, at);
    ensure_idle_cleanup_tasks(&mut projection, catalog, at);
    projection.last_update_ms = at;
    if !projection.blocked_resident_tasks.is_empty() {
        return Err(CommandError::new("dependency cannot physically complete"));
    }
    Ok(projection)
}
pub(super) fn admit(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    chain_id: &str,
    requests: &[ConcreteJobRequest],
) -> Result<Vec<FarmEvent>, CommandError> {
    if chain_id.is_empty() || farm.concrete_chains.contains_key(chain_id) {
        return Err(CommandError::new(
            "concrete chain already exists or has empty identity",
        ));
    }
    if requests.is_empty() {
        return Err(CommandError::new("concrete chain requires jobs"));
    }
    let identity_count = requests
        .iter()
        .try_fold(0u64, |count, request| {
            count.checked_add(
                if matches!(request.work, ConcreteWork::StartOvenRecipe { .. }) {
                    2
                } else {
                    1
                },
            )
        })
        .ok_or_else(|| CommandError::new("identity range overflow"))?;
    farm.next_id
        .checked_add(identity_count)
        .ok_or_else(|| CommandError::new("identity range overflow"))?;
    let mut ids = BTreeSet::new();
    for request in requests {
        if request.id.is_empty() || !ids.insert(request.id.clone()) {
            return Err(CommandError::new("duplicate concrete job identity"));
        }
        find_resident_index(farm, &request.resident_id)?;
    }
    for request in requests {
        if request.after.iter().any(|id| !ids.contains(id)) {
            return Err(CommandError::new("unknown job dependency"));
        }
    }
    let mut stored = BTreeMap::<String, u32>::new();
    for input in requests
        .iter()
        .flat_map(|job| &job.inputs)
        .filter(|input| matches!(input.source, ConcreteInputSource::Stored))
    {
        let quantity = stored.entry(input.item_id.clone()).or_default();
        *quantity = quantity
            .checked_add(input.quantity)
            .ok_or_else(|| CommandError::new("stored input quantity overflow"))?;
        if *quantity > available_stored_quantity(farm, &input.item_id) {
            return Err(CommandError::new(
                "stored input quantity is already reserved or insufficient",
            ));
        }
    }
    let mut scratch = farm.clone();
    scratch.concrete_chains.insert(
        chain_id.to_owned(),
        ConcreteChain {
            jobs: BTreeMap::new(),
        },
    );
    let mut remaining = requests.iter().collect::<Vec<_>>();
    while !remaining.is_empty() {
        let Some(index) = remaining.iter().position(|request| {
            request
                .after
                .iter()
                .all(|id| scratch.concrete_chains[chain_id].jobs.contains_key(id))
                && request.inputs.iter().all(|input| match &input.source {
                    ConcreteInputSource::ProducerOutput {
                        chain_id: None,
                        job_id,
                    } => scratch.concrete_chains[chain_id].jobs.contains_key(job_id),
                    _ => true,
                })
                && match &request.work {
                    ConcreteWork::CollectOvenJob { producer_id } => scratch.concrete_chains
                        [chain_id]
                        .jobs
                        .contains_key(producer_id),
                    _ => true,
                }
        }) else {
            return Err(CommandError::new("cyclic or unknown producer dependency"));
        };
        let request = remaining.remove(index);
        admit_job(&mut scratch, catalog, chain_id, request)?;
    }
    // No simulated inventory, XP, clock or generated events are committed.
    *farm = scratch;
    Ok(Vec::new())
}
fn admit_job(
    farm: &mut FarmState,
    catalog: &CatalogDocument,
    chain_id: &str,
    request: &ConcreteJobRequest,
) -> Result<(), CommandError> {
    let mut at = farm.last_update_ms;
    if let Some(last) = farm
        .resident_task_queues
        .get(&request.resident_id)
        .and_then(|queue| queue.last())
    {
        at = at.max(tail(last)?);
    }
    for id in &request.after {
        at = at.max(job_end(farm, producer(farm, chain_id, id)?)?);
    }
    let mut own_claims = BTreeMap::<(String, String), u32>::new();
    for input in &request.inputs {
        let Some(key) = source_key(farm, chain_id, input)? else {
            continue;
        };
        let (outputs, end) = match &input.source {
            ConcreteInputSource::ProducerOutput {
                chain_id: source_chain,
                job_id,
            } => {
                let source = producer(farm, source_chain.as_deref().unwrap_or(chain_id), job_id)?;
                if !source
                    .task_ids
                    .iter()
                    .any(|id| task(farm, &source.resident_id, id).is_some())
                {
                    return Err(CommandError::new(
                        "producer is completed; use actual current storage",
                    ));
                }
                (source.outputs.clone(), job_end(farm, source)?)
            }
            ConcreteInputSource::CommittedTaskOutput {
                resident_id,
                task_id,
            } => {
                let source = task(farm, resident_id, task_id).ok_or_else(|| {
                    CommandError::new("unknown or completed committed producer task")
                })?;
                let outputs = source
                    .steps
                    .iter()
                    .flat_map(|step| step_inventory_outputs(farm, catalog, &step.work))
                    .collect();
                (outputs, tail(&source)?)
            }
            ConcreteInputSource::Stored => unreachable!(),
        };
        let declared = outputs
            .iter()
            .filter(|stack| stack.item_id == input.item_id)
            .try_fold(0u32, |sum, stack| sum.checked_add(stack.quantity))
            .ok_or_else(|| CommandError::new("producer quantity overflow"))?;
        let pending = pending_supply(farm, &key.0, &input.item_id);
        let produced = if matches!(
            input.source,
            ConcreteInputSource::CommittedTaskOutput { .. }
        ) {
            pending
        } else {
            declared.min(pending)
        };
        let mut claimed = 0u32;
        for (chain, record) in &farm.concrete_chains {
            for claim in record
                .jobs
                .values()
                .filter(|job| !job.input_claims_released)
                .flat_map(|job| &job.inputs)
            {
                if source_key(farm, chain, claim)?.as_ref() == Some(&key) {
                    claimed = claimed
                        .checked_add(claim.quantity)
                        .ok_or_else(|| CommandError::new("claimed quantity overflow"))?;
                }
            }
        }
        let quantity = own_claims.entry(key).or_default();
        *quantity = quantity
            .checked_add(input.quantity)
            .ok_or_else(|| CommandError::new("producer quantity overflow"))?;
        if *quantity > produced.saturating_sub(claimed) {
            return Err(CommandError::new(
                "producer quantity already reserved or insufficient",
            ));
        }
        at = at.max(end);
    }
    let mut projection = forecast(farm, catalog, at)?;
    projection.selected_resident_id = request.resident_id.clone();
    let mut crop_terms = None;
    let (work, kind, outputs, terms, production_job_id) = match &request.work {
        ConcreteWork::PlantCrop { plot_id, crop_id } => {
            let crop = catalog
                .crop(crop_id)
                .ok_or_else(|| CommandError::new("unknown crop"))?;
            require_level(farm, crop.unlock_level)?;
            crop_terms = Some(crate::ConcreteCropTerms {
                crop: crop.clone(),
                duration_ms: scaled_duration_ms(crop.reference_seconds, catalog.balance.time_scale),
            });
            expect_inputs(&request.inputs, &[ItemStack::new(crop_id, 1)])?;
            if field_plot_is_reserved(farm, plot_id) {
                return Err(CommandError::new("field plot is reserved"));
            }
            let plot = projection
                .field_plots
                .iter()
                .find(|plot| plot.id == *plot_id)
                .ok_or_else(|| CommandError::new("field plot not found"))?;
            if plot.crop.is_some() {
                return Err(CommandError::new("field plot is already planted"));
            }
            (
                resident_task_step(
                    ReservedWorkTarget::FieldPlot {
                        plot_id: plot_id.clone(),
                    },
                    ResidentTaskStepWork::PlantCrop {
                        crop_id: crop_id.clone(),
                    },
                ),
                ResidentTaskKind::FieldWork,
                Vec::new(),
                None,
                None,
            )
        }
        ConcreteWork::HarvestCrop { plot_id } => {
            expect_inputs(&request.inputs, &[])?;
            let plot = projection
                .field_plots
                .iter()
                .find(|plot| plot.id == *plot_id)
                .ok_or_else(|| CommandError::new("field plot not found"))?;
            let planted = plot
                .crop
                .clone()
                .ok_or_else(|| CommandError::new("field plot is empty"))?;
            if farm.resident_task_queues.values().flatten().flat_map(|task| &task.steps).any(|step| matches!(&step.reserved_work_target, ReservedWorkTarget::FieldPlot { plot_id: id } if id == plot_id) && matches!(step.work, ResidentTaskStepWork::HarvestCrop { .. })) { return Err(CommandError::new("harvest plot is reserved")); }
            at = at.max(planted.ready_at_ms);
            projection = forecast(farm, catalog, at)?;
            projection.selected_resident_id = request.resident_id.clone();
            let crop = catalog
                .crop(&planted.item_id)
                .ok_or_else(|| CommandError::new("unknown crop"))?;
            crop_terms = Some(crate::ConcreteCropTerms {
                crop: crop.clone(),
                duration_ms: scaled_duration_ms(crop.reference_seconds, catalog.balance.time_scale),
            });
            let outputs = vec![ItemStack::new(&planted.item_id, crop.harvest_quantity)];
            if !has_storage_room_after_reservations(farm, catalog, &outputs) {
                return Err(CommandError::new("Silo storage capacity is full"));
            }
            (
                resident_task_step(
                    ReservedWorkTarget::FieldPlot {
                        plot_id: plot_id.clone(),
                    },
                    ResidentTaskStepWork::HarvestCrop {
                        crop_id: planted.item_id,
                        quantity: crop.harvest_quantity,
                    },
                ),
                ResidentTaskKind::FieldWork,
                outputs,
                None,
                None,
            )
        }
        ConcreteWork::StartOvenRecipe { recipe_id } => {
            let recipe = catalog
                .recipe(recipe_id)
                .ok_or_else(|| CommandError::new("unknown recipe"))?
                .clone();
            require_level(farm, recipe.unlock_level)?;
            if recipe.target != RecipeTarget::Oven
                || !farm
                    .owned_farmhouse_upgrades
                    .contains(&FarmhouseUpgradeKind::Oven)
            {
                return Err(CommandError::new("Oven is unavailable"));
            }
            expect_inputs(&request.inputs, &recipe.inputs)?;
            if !has_storage_room_after_reservations(farm, catalog, &recipe.outputs) {
                return Err(CommandError::new("Barn storage capacity is full"));
            }
            let limit = catalog
                .farmhouse_upgrade(FarmhouseUpgradeKind::Oven)
                .ok_or_else(|| CommandError::new("unknown Oven"))?
                .queue_limit;
            if farm.oven.queue.len() >= limit {
                return Err(CommandError::new("Oven queue is full"));
            }
            let id = next_id(farm, "job");
            let job = OvenJob {
                id: id.clone(),
                recipe_id: recipe.id.clone(),
                status: OvenJobStatus::PendingStart,
                started_at_ms: 0,
                ready_at_ms: 0,
            };
            farm.oven.queue.push(job.clone());
            projection.oven.queue.push(job);
            let terms = ConcreteRecipeTerms {
                duration_ms: scaled_duration_ms(
                    recipe.reference_seconds,
                    catalog.balance.time_scale,
                ),
                recipe: recipe.clone(),
            };
            (
                resident_task_step(
                    ReservedWorkTarget::Oven,
                    ResidentTaskStepWork::StartOvenRecipe {
                        job_id: id.clone(),
                        recipe_id: recipe.id,
                    },
                ),
                ResidentTaskKind::ProductionWork,
                recipe.outputs,
                Some(terms),
                Some(id),
            )
        }
        ConcreteWork::CollectOvenJob { producer_id } => {
            expect_inputs(&request.inputs, &[])?;
            let source = producer(farm, chain_id, producer_id)?;
            let id = source.production_job_id.clone().ok_or_else(|| {
                CommandError::new("collection dependency is not an Oven producer")
            })?;
            if farm
                .concrete_chains
                .values()
                .flat_map(|chain| chain.jobs.values())
                .any(|job| {
                    matches!(job.work, ConcreteWork::CollectOvenJob { .. })
                        && job.production_job_id.as_ref() == Some(&id)
                })
            {
                return Err(CommandError::new("Oven output is already reserved"));
            }
            let recipe = source
                .recipe_terms
                .as_ref()
                .ok_or_else(|| CommandError::new("missing accepted recipe terms"))?
                .recipe
                .clone();
            at = at.max(job_end(farm, source)?);
            projection = forecast(farm, catalog, at)?;
            let oven_job = projection
                .oven
                .queue
                .iter()
                .find(|job| job.id == id)
                .ok_or_else(|| CommandError::new("Oven producer dependency disappeared"))?;
            at = at.max(oven_job.ready_at_ms);
            projection = forecast(farm, catalog, at)?;
            projection.selected_resident_id = request.resident_id.clone();
            (
                resident_task_step(
                    ReservedWorkTarget::Oven,
                    ResidentTaskStepWork::CollectOvenJob {
                        job_id: id.clone(),
                        recipe_id: recipe.id,
                    },
                ),
                ResidentTaskKind::ProductionWork,
                recipe.outputs,
                None,
                Some(id),
            )
        }
    };
    let planned = plan_resident_work(&mut projection, catalog, at, kind, vec![work])?;
    let count = planned.steps.len();
    let id = next_id(farm, "task");
    let task = ResidentTask {
        stop_requested: false,
        id: id.clone(),
        kind: planned.kind,
        steps: planned.steps,
        started_at_ms: planned.started_at_ms,
        ready_at_ms: planned.ready_at_ms,
    };
    tail(&task)?;
    let mut completed_at = task.ready_at_ms;
    for (index, step) in task.steps.iter().enumerate() {
        if index > 0 {
            completed_at = completed_at
                .checked_add(resident_task_step_duration_ms(step))
                .ok_or_else(|| CommandError::new("task time overflow"))?;
        }
        let duration = match &step.work {
            ResidentTaskStepWork::PlantCrop { .. } => {
                crop_terms.as_ref().map(|terms| terms.duration_ms)
            }
            ResidentTaskStepWork::StartOvenRecipe { .. } => {
                terms.as_ref().map(|terms| terms.duration_ms)
            }
            _ => None,
        };
        if let Some(duration) = duration {
            completed_at
                .checked_add(duration)
                .ok_or_else(|| CommandError::new("production time overflow"))?;
        }
    }
    farm.resident_task_queues
        .entry(request.resident_id.clone())
        .or_default()
        .push(task);
    farm.concrete_chains
        .get_mut(chain_id)
        .expect("admission owns chain")
        .jobs
        .insert(
            request.id.clone(),
            ConcreteJob {
                resident_id: request.resident_id.clone(),
                after: request.after.clone(),
                inputs: request.inputs.clone(),
                task_ids: vec![id],
                production_job_id,
                work: request.work.clone(),
                initial_step_count: count,
                outputs,
                recipe_terms: terms,
                crop_terms,
                input_claims_released: false,
            },
        );
    Ok(())
}

fn dependencies(farm: &FarmState, chain_id: &str, job: &ConcreteJob) -> Result<i64, CommandError> {
    let mut at = i64::MIN;
    for id in &job.after {
        at = at.max(job_end_without_clock(farm, producer(farm, chain_id, id)?)?);
    }
    for input in &job.inputs {
        match &input.source {
            ConcreteInputSource::ProducerOutput {
                chain_id: source_chain,
                job_id,
            } => {
                at = at.max(job_end_without_clock(
                    farm,
                    producer(farm, source_chain.as_deref().unwrap_or(chain_id), job_id)?,
                )?)
            }
            ConcreteInputSource::CommittedTaskOutput {
                resident_id,
                task_id,
            } => {
                if let Some(source) = task(farm, resident_id, task_id) {
                    at = at.max(tail(&source)?);
                }
            }
            ConcreteInputSource::Stored => {}
        }
    }
    if let ConcreteWork::CollectOvenJob { producer_id } = &job.work {
        let source = producer(farm, chain_id, producer_id)?;
        at = at.max(job_end_without_clock(farm, source)?);
        if let Some(oven) = farm
            .oven
            .queue
            .iter()
            .find(|oven| Some(&oven.id) == source.production_job_id.as_ref())
        {
            if oven.status == OvenJobStatus::Producing {
                at = at.max(oven.ready_at_ms);
            }
        }
    }
    Ok(at)
}
fn job_end_without_clock(farm: &FarmState, job: &ConcreteJob) -> Result<i64, CommandError> {
    job.task_ids
        .iter()
        .filter_map(|id| task(farm, &job.resident_id, id))
        .try_fold(i64::MIN, |at, task| Ok(at.max(tail(&task)?)))
}
/// Slide only still-waiting concrete tasks through the existing queue. Actual
/// delivery steps must finish; their nominal ready time is not inventory credit.
pub(super) fn reconcile(farm: &mut FarmState) -> Result<(), CommandError> {
    let changes = farm
        .concrete_chains
        .iter()
        .flat_map(|(chain_id, chain)| chain.jobs.values().map(move |job| (chain_id, job)))
        .filter_map(|(chain_id, job)| {
            let id = job.task_ids.first()?;
            let task = task(farm, &job.resident_id, id)?;
            if task.stop_requested || task.steps.len() != job.initial_step_count {
                return None;
            }
            Some(
                dependencies(farm, chain_id, job)
                    .map(|at| (job.resident_id.clone(), id.clone(), at)),
            )
        })
        .collect::<Result<Vec<_>, _>>()?;
    for (resident, id, dependency_at) in changes {
        let queue = farm
            .resident_task_queues
            .get_mut(&resident)
            .expect("task came from queue");
        let index = queue
            .iter()
            .position(|task| task.id == id)
            .expect("task came from queue");
        let previous = if index > 0 {
            tail(&queue[index - 1])?
        } else {
            i64::MIN
        };
        let task = &mut queue[index];
        let start = task.started_at_ms.max(dependency_at).max(previous);
        if start > task.started_at_ms {
            let delay = start
                .checked_sub(task.started_at_ms)
                .ok_or_else(|| CommandError::new("dependency timing overflow"))?;
            task.ready_at_ms = task
                .ready_at_ms
                .checked_add(delay)
                .ok_or_else(|| CommandError::new("dependency timing overflow"))?;
            task.started_at_ms = start;
        }
    }
    for queue in farm.resident_task_queues.values_mut() {
        let Some(task) = queue.first_mut() else {
            continue;
        };
        let Some(step) = task.steps.first() else {
            continue;
        };
        if let ResidentTaskStepWork::CollectOvenJob { job_id, .. } = &step.work {
            if let Some(job) = farm
                .oven
                .queue
                .iter()
                .find(|job| job.id == *job_id && job.status == OvenJobStatus::Producing)
            {
                task.ready_at_ms = task.ready_at_ms.max(job.ready_at_ms);
            }
        }
    }
    Ok(())
}
pub(super) fn required_task(farm: &FarmState, resident: &str, id: &str) -> bool {
    farm.concrete_chains.iter().any(|(chain_id, chain)| {
        chain.jobs.values().any(|job| {
            if job.input_claims_released {
                return false;
            }
            if !job
                .task_ids
                .iter()
                .any(|task_id| task(farm, &job.resident_id, task_id).is_some())
            {
                return false;
            }
            let intrinsic_producer = match &job.work {
                ConcreteWork::CollectOvenJob { producer_id } => {
                    chain.jobs.get(producer_id).is_some_and(|producer| {
                        producer.resident_id == resident
                            && producer.task_ids.iter().any(|task_id| task_id == id)
                    })
                }
                _ => false,
            };
            intrinsic_producer
                || job.after.iter().any(|source| {
                    chain.jobs.get(source).is_some_and(|producer| {
                        producer.resident_id == resident
                            && producer.task_ids.iter().any(|task_id| task_id == id)
                    })
                })
                || job.inputs.iter().any(|input| match &input.source {
                    ConcreteInputSource::CommittedTaskOutput {
                        resident_id,
                        task_id,
                    } => resident_id == resident && task_id == id,
                    ConcreteInputSource::ProducerOutput {
                        chain_id: source_chain,
                        job_id,
                    } => producer(farm, source_chain.as_deref().unwrap_or(chain_id), job_id)
                        .is_ok_and(|producer| {
                            producer.resident_id == resident
                                && producer.task_ids.iter().any(|task_id| task_id == id)
                        }),
                    ConcreteInputSource::Stored => false,
                })
        })
    })
}

pub(super) fn crop_terms(farm: &FarmState, task_id: &str) -> Option<crate::ConcreteCropTerms> {
    farm.concrete_chains
        .values()
        .flat_map(|chain| chain.jobs.values())
        .find(|job| job.task_ids.iter().any(|id| id == task_id))
        .and_then(|job| job.crop_terms.clone())
}

fn pending_supply(farm: &FarmState, identity: &str, item: &str) -> u32 {
    let Some(id) = identity.strip_prefix("task:") else {
        return 0;
    };
    let remaining = farm
        .resident_task_queues
        .values()
        .flatten()
        .find(|task| task.id == id)
        .map(|task| {
            task.steps
                .iter()
                .filter_map(|step| match &step.work {
                    ResidentTaskStepWork::HarvestCrop { crop_id, quantity } if crop_id == item => {
                        Some(*quantity)
                    }
                    _ => None,
                })
                .fold(0u32, u32::saturating_add)
        })
        .unwrap_or(0);
    let carried = farm
        .resident_harvest_cargo
        .values()
        .flatten()
        .filter(|cargo| cargo.task_id == id && cargo.crop_id == item)
        .map(|cargo| cargo.quantity)
        .fold(0u32, u32::saturating_add);
    remaining.saturating_add(carried)
}
/// Unproduced supply discounts physical pickup reservations only once for each
/// actual producer. Actual Silo deposits stop that discount immediately.
pub(super) fn unproduced_pickups(farm: &FarmState, item: &str) -> u32 {
    let mut pending_claims = BTreeMap::<String, u32>::new();
    for (chain_id, chain) in &farm.concrete_chains {
        for job in chain.jobs.values().filter(|job| !job.input_claims_released) {
            let pickups = job
                .task_ids
                .iter()
                .filter_map(|id| task(farm, &job.resident_id, id))
                .flat_map(|task| task.steps)
                .filter_map(|step| match step.work {
                    ResidentTaskStepWork::PickupItems { items, .. } => Some(items),
                    _ => None,
                })
                .flatten()
                .filter(|stack| stack.item_id == item)
                .map(|stack| stack.quantity)
                .fold(0u32, u32::saturating_add);
            let mut remaining = pickups;
            for input in job.inputs.iter().filter(|input| input.item_id == item) {
                let Ok(Some((source, _))) = source_key(farm, chain_id, input) else {
                    continue;
                };
                let quantity = input.quantity.min(remaining);
                remaining -= quantity;
                let claim = pending_claims.entry(source).or_default();
                *claim = claim.saturating_add(quantity);
            }
        }
    }
    pending_claims
        .into_iter()
        .map(|(source, quantity)| quantity.min(pending_supply(farm, &source, item)))
        .fold(0u32, u32::saturating_add)
}
/// Stop releases provenance only if its input-consuming work is actually removed.
pub(super) fn release_removed_inputs(
    farm: &mut FarmState,
    resident: &str,
    task_id: &str,
    removed: &[ResidentTaskStep],
) {
    for job in farm
        .concrete_chains
        .values_mut()
        .flat_map(|chain| chain.jobs.values_mut())
        .filter(|job| job.resident_id == resident && job.task_ids.iter().any(|id| id == task_id))
    {
        let removed_work = removed.iter().any(|step| {
            matches!(
                (&job.work, &step.work),
                (
                    ConcreteWork::StartOvenRecipe { .. },
                    ResidentTaskStepWork::StartOvenRecipe { .. }
                ) | (
                    ConcreteWork::PlantCrop { .. },
                    ResidentTaskStepWork::PlantCrop { .. }
                ) | (
                    ConcreteWork::HarvestCrop { .. },
                    ResidentTaskStepWork::HarvestCrop { .. }
                ) | (
                    ConcreteWork::CollectOvenJob { .. },
                    ResidentTaskStepWork::CollectOvenJob { .. }
                )
            )
        });
        if removed_work {
            job.input_claims_released = true;
        }
    }
}

pub(super) fn physically_reserved_pickups(farm: &FarmState, item: &str) -> u32 {
    let ids = farm
        .concrete_chains
        .values()
        .flat_map(|chain| chain.jobs.values())
        .flat_map(|job| &job.task_ids)
        .collect::<BTreeSet<_>>();
    let pickups = farm
        .resident_task_queues
        .values()
        .flatten()
        .filter(|task| ids.contains(&task.id))
        .flat_map(|task| &task.steps)
        .filter_map(|step| match &step.work {
            ResidentTaskStepWork::PickupItems { items, .. } => Some(items),
            _ => None,
        })
        .flatten()
        .filter(|stack| stack.item_id == item)
        .map(|stack| stack.quantity)
        .fold(0u32, u32::saturating_add);
    pickups.saturating_sub(unproduced_pickups(farm, item))
}
