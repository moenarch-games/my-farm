import { secondsRemaining } from "@my-farm/game-model/selectors";
import { currentResidentScenePose, type ResidentScenePath, residentWork } from "@my-farm/game-model/residentTasks";
import { type FarmView, type ResidentStepView, type ResidentTaskSummaryView } from "@my-farm/contracts";

export type ResidentTaskPreviewSelection = {
  residentId: string;
  taskId: string;
} | null;

export function queueStateLabel(task: ResidentTaskSummaryView, fallback: string) {
  if (task.queue_state === "blocked") {
    return "Blocked";
  }
  if (task.queue_state === "current") {
    return "Current";
  }
  if (task.queue_state === "waiting") {
    return "Waiting";
  }
  if (task.queue_state === "queued") {
    return "Queued";
  }
  return fallback;
}

export function stepPhaseLabel(phase: ResidentStepView["phase"]) {
  switch (phase) {
    case "active_work":
      return "Active work";
    case "autonomous_wait":
      return "Autonomous wait";
    case "collection_deposit":
      return "Collection/deposit";
  }
}

/** Remaining time from the authoritative step schedule in the read model. */
export function predictedStepTiming(
  step: ResidentStepView,
  task: ResidentTaskSummaryView | undefined,
  state: ReturnType<typeof currentResidentScenePose>["state"],
  nowMs: number,
) {
  if (state === "blocked") {
    return "Blocked";
  }
  const stepDone = secondsRemaining(step.ends_at_ms, nowMs);
  const lead =
    state === "walking"
      ? `Arrives in ${secondsRemaining(step.starts_at_ms + step.walk_duration_ms, nowMs)}s, step done in ${stepDone}s`
      : step.phase === "autonomous_wait"
        ? `Resident needed in ${stepDone}s`
        : `Step done in ${stepDone}s`;
  const lastStep = task?.steps.at(-1);
  if (!task || task.steps.length < 2 || !lastStep) {
    return lead;
  }
  return `${lead} - task done in ${secondsRemaining(lastStep.ends_at_ms, nowMs)}s`;
}

export function formatStepTiming(step: ResidentStepView) {
  return `Walk ${formatDuration(step.walk_duration_ms)} / Work ${formatDuration(step.work_duration_ms)}`;
}

export function formatDuration(durationMs: number) {
  if (durationMs <= 0) {
    return "0s";
  }
  const seconds = Math.round(durationMs / 1000);
  return `${seconds}s`;
}

export function formatStepQuantity(step: ResidentStepView) {
  if (step.quantity === 0) {
    return itemKindLabel(step.kind);
  }
  return `${step.quantity} ${itemKindLabel(step.kind)}`;
}

function itemKindLabel(kind: ResidentStepView["kind"]) {
  if (kind === "animal_product") {
    return "animal product";
  }
  return kind;
}

export function selectedResidentTaskPreviewPath(
  view: FarmView,
  selection: ResidentTaskPreviewSelection,
): ResidentScenePath | null {
  if (!selection) {
    return null;
  }
  const task = residentWork(view, selection.residentId)?.queue.find((entry) => entry.id === selection.taskId);
  if (!task || task.preview.path.length === 0) {
    return null;
  }
  return {
    residentId: selection.residentId,
    tiles: task.preview.path,
    state: "walking",
  };
}

export function sceneStateLabel(state: ReturnType<typeof currentResidentScenePose>["state"]) {
  switch (state) {
    case "idle":
      return "Idle";
    case "walking":
      return "Walking";
    case "blocked":
      return "Blocked";
    case "waiting":
      return "Waiting (free for other work)";
    case "working":
      return "Working";
  }
}
