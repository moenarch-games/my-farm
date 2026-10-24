import { ResourceIcon } from "../../components/ResourceIcon";
import { currentResidentScenePose, residentWork, residentTaskStatus, residentTaskStepLabel, taskLabel } from "@my-farm/game-model/residentTasks";
import { type CatalogDocument, type FarmResident, type FarmView, type ResidentTaskSummaryView } from "@my-farm/contracts";
import { type ResidentTaskPreviewSelection, formatDuration, formatStepQuantity, formatStepTiming, predictedStepTiming, queueStateLabel, sceneStateLabel, stepPhaseLabel } from "./residentTaskFormat";
import { type SendCommand } from "../runtime/farmCommandRunner";

export function ResidentActions({
  catalog,
  view,
  resident,
  nowMs,
  send,
  selectedTaskPreview,
  onPreviewTask,
}: {
  catalog: CatalogDocument;
  view: FarmView;
  resident: FarmResident;
  nowMs: number;
  send: SendCommand;
  selectedTaskPreview: ResidentTaskPreviewSelection;
  onPreviewTask: (selection: ResidentTaskPreviewSelection) => void;
}) {
  const status = residentTaskStatus(catalog, view, resident.id, nowMs);
  const work = residentWork(view, resident.id);
  const pose = currentResidentScenePose(view, resident.id, nowMs);
  const currentStep = work?.current_step ?? null;
  const queue = work?.queue ?? [];
  return (
    <div className="action-stack resident-details">
      <div className="resident-details__header">
        <strong>{resident.display_name}</strong>
        <span>{resident.id === view.selected_resident_id ? "Selected for work" : "Inspecting"}</span>
      </div>
      <dl className="resident-card__status">
        <div>
          <dt>State</dt>
          <dd>{sceneStateLabel(pose.state)}</dd>
        </div>
        <div>
          <dt>Current task</dt>
          <dd>{status.label}</dd>
        </div>
        <div>
          <dt>Current step</dt>
          <dd>{currentStep ? residentTaskStepLabel(catalog, currentStep) : "None"}</dd>
        </div>
        {currentStep ? (
          <>
            <div>
              <dt>Phase</dt>
              <dd>{stepPhaseLabel(currentStep.phase)}</dd>
            </div>
            <div>
              <dt>Predicted</dt>
              <dd>{predictedStepTiming(currentStep, work?.current_task, pose.state, nowMs)}</dd>
            </div>
          </>
        ) : null}
        <div>
          <dt>Target</dt>
          <dd>{pose.label}</dd>
        </div>
      </dl>
      {work?.block ? <p className="resident-task-blocked">{work.block.message}</p> : null}
      {status.currentTask ? (
        <div className="resident-task-progress">
          <progress value={status.progress} max={1} aria-label={`${resident.display_name} task progress`} />
          <span>{Math.round(status.progress * 100)}%</span>
        </div>
      ) : null}
      <ResidentCarrySummary work={work} />
      <div className="resident-queue">
        <strong>Task queue</strong>
        {queue.length === 0 ? (
          <p>Idle</p>
        ) : (
          <ol className="resident-queue__list">
            {queue.map((task, index) => (
              <ResidentTaskQueueRow
                key={task.id}
                catalog={catalog}
                residentId={resident.id}
                task={task}
                queue={queue}
                index={index}
                fallbackQueueState={index === 0 ? "Current" : "Queued"}
                selected={selectedTaskPreview?.residentId === resident.id && selectedTaskPreview.taskId === task.id}
                onPreviewTask={onPreviewTask}
                onReorderTask={async (taskId, beforeTaskId) => {
                  await send({
                    type: "reorder_resident_task",
                    resident_id: resident.id,
                    task_id: taskId,
                    ...(beforeTaskId ? { before_task_id: beforeTaskId } : {}),
                  });
                }}
              />
            ))}
            {queue.length > 2 ? (
              <li
                className="resident-queue-drop-target"
                onDragOver={(event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = "move";
                }}
                onDrop={(event) => {
                  const draggedTaskId = event.dataTransfer.getData("application/x-my-farm-resident-task");
                  if (!draggedTaskId) {
                    return;
                  }
                  event.preventDefault();
                  void send({
                    type: "reorder_resident_task",
                    resident_id: resident.id,
                    task_id: draggedTaskId,
                  });
                }}
              >
                Drop at end
              </li>
            ) : null}
          </ol>
        )}
      </div>
    </div>
  );
}

export function ResidentTaskQueueRow({
  catalog,
  residentId,
  task,
  queue,
  index,
  fallbackQueueState,
  selected,
  onPreviewTask,
  onReorderTask,
}: {
  catalog: CatalogDocument;
  residentId: string;
  task: ResidentTaskSummaryView;
  queue: ResidentTaskSummaryView[];
  index: number;
  fallbackQueueState: string;
  selected: boolean;
  onPreviewTask: (selection: ResidentTaskPreviewSelection) => void;
  onReorderTask: (taskId: string, beforeTaskId?: string) => Promise<void>;
}) {
  const reorderable = index > 0 && task.queue_state === "queued";
  const moveUpBeforeTaskId = index > 1 ? queue[index - 1]?.id : null;
  const moveDownBeforeTaskId = queue[index + 2]?.id ?? null;
  const canMoveUp = reorderable && index > 1;
  const canMoveDown = reorderable && index < queue.length - 1;
  const previewTask = () => onPreviewTask({ residentId, taskId: task.id });
  const reorder = async (beforeTaskId?: string) => {
    await onReorderTask(task.id, beforeTaskId);
  };

  return (
    <li
      className={selected ? "resident-queue-task resident-queue-task--selected" : "resident-queue-task"}
      draggable={reorderable}
      data-task-id={task.id}
      data-task-reorderable={reorderable}
      onDragStart={(event) => {
        if (!reorderable) {
          event.preventDefault();
          return;
        }
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("application/x-my-farm-resident-task", task.id);
      }}
      onDragOver={(event) => {
        if (reorderable) {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }
      }}
      onDrop={(event) => {
        if (!reorderable) {
          return;
        }
        const draggedTaskId = event.dataTransfer.getData("application/x-my-farm-resident-task");
        if (!draggedTaskId || draggedTaskId === task.id) {
          return;
        }
        event.preventDefault();
        void onReorderTask(draggedTaskId, task.id);
      }}
    >
      <details open={selected}>
        <summary onClick={previewTask}>
          <span>{taskLabel(catalog, task)}</span>
          <small>
            {queueStateLabel(task, fallbackQueueState)} - {task.step_count}{" "}
            {task.step_count === 1 ? "step" : "steps"}
          </small>
        </summary>
        <ol className="resident-queue-steps">
          {task.steps.map((step, index) => (
            <li
              key={`${task.id}-${index}`}
              className={step.requires_resident ? undefined : "resident-queue-step--autonomous"}
            >
              <div>
                <strong>{residentTaskStepLabel(catalog, step)}</strong>
                <small>
                  {stepPhaseLabel(step.phase)} - {step.target?.label ?? "Work target"}
                </small>
              </div>
              <span>
                {step.requires_resident
                  ? `${formatStepTiming(step)} - ${formatStepQuantity(step)}`
                  : `Resident free ${formatDuration(step.duration_ms)}`}
              </span>
            </li>
          ))}
        </ol>
      </details>
      <div className="resident-queue-task__controls">
        <button
          type="button"
          disabled={!canMoveUp || !moveUpBeforeTaskId}
          onClick={() => {
            if (moveUpBeforeTaskId) {
              void reorder(moveUpBeforeTaskId);
            }
          }}
        >
          Move up
        </button>
        <button
          type="button"
          disabled={!canMoveDown}
          onClick={() => {
            void reorder(moveDownBeforeTaskId ?? undefined);
          }}
        >
          Move down
        </button>
      </div>
    </li>
  );
}

export function ResidentCarrySummary({
  work,
  compact = false,
}: {
  work: ReturnType<typeof residentWork>;
  compact?: boolean;
}) {
  const itemEntries = work?.carry.items ?? [];
  const toolEntries = work?.carry.tools ?? [];

  if (itemEntries.length === 0 && toolEntries.length === 0) {
    return compact ? null : (
      <div className="resident-carry">
        <strong>Carrying</strong>
        <p>Empty</p>
      </div>
    );
  }

  return (
    <div className={compact ? "resident-carry resident-carry--compact" : "resident-carry"}>
      {!compact ? <strong>Carrying</strong> : null}
      <div className="resident-carry__chips">
        {itemEntries.map((item) => {
          return (
            <span className="resident-carry-chip" key={`item-${item.item_id}`}>
              <ResourceIcon type="item" itemId={item.item_id} itemKind={item.kind} />
              {item.quantity} {item.name}
            </span>
          );
        })}
        {toolEntries.map((tool) => (
          <span className="resident-carry-chip" key={`tool-${tool.tool_kind}`}>
            {tool.quantity} {tool.label}
          </span>
        ))}
      </div>
    </div>
  );
}
