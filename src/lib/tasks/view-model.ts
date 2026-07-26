import type { NormalizedRun } from "../sources/types";

export type TaskCardView = {
  task: string;
  runCount: number;
  modelCount: number;
  models: string[];
  representativeRunId: string | null;
};

export type TaskDetailView = {
  task: string;
  runs: NormalizedRun[];
  models: Array<{ model: string; runs: NormalizedRun[] }>;
  representativeRunId: string | null;
};

export type ComparisonRequest = {
  task?: string;
  leftId?: string;
  rightId?: string;
};

export type ComparisonSelection = {
  task: string | null;
  leftId: string | null;
  rightId: string | null;
  tasks: Array<{ task: string; modelCount: number }>;
  models: Array<{ model: string; runs: NormalizedRun[] }>;
  reason: "ready" | "no-tasks" | "not-enough-models";
};

type ModelRuns = { model: string; runs: NormalizedRun[] };

function compareText(left: string, right: string) {
  return left.localeCompare(right);
}

function dateValue(value: string | null): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function sortRunsNewestFirst(runs: NormalizedRun[]): NormalizedRun[] {
  return [...runs].sort((left, right) => {
    const leftDate = dateValue(left.createdAt);
    const rightDate = dateValue(right.createdAt);

    if (leftDate !== null && rightDate !== null && leftDate !== rightDate) return rightDate - leftDate;
    if (leftDate !== null && rightDate === null) return -1;
    if (leftDate === null && rightDate !== null) return 1;
    return compareText(left.id, right.id);
  });
}

function hasPreview(run: NormalizedRun) {
  return Boolean(run.previewPath && run.task && run.previewPath.startsWith(`benchmarks/${run.task}/`));
}

function representativeRunId(runs: NormalizedRun[]) {
  const sortedRuns = sortRunsNewestFirst(runs);
  return sortedRuns.find(hasPreview)?.id ?? sortedRuns[0]?.id ?? null;
}

function groupModels(runs: NormalizedRun[]): ModelRuns[] {
  const byModel = new Map<string, NormalizedRun[]>();
  for (const run of runs) {
    if (!run.model) continue;
    byModel.set(run.model, [...(byModel.get(run.model) ?? []), run]);
  }

  return [...byModel.entries()]
    .map(([model, groupedRuns]) => ({ model, runs: sortRunsNewestFirst(groupedRuns) }))
    .sort((left, right) => compareText(left.model, right.model));
}

function groupTaskRuns(runs: NormalizedRun[]) {
  const byTask = new Map<string, NormalizedRun[]>();
  for (const run of runs) {
    if (!run.task) continue;
    byTask.set(run.task, [...(byTask.get(run.task) ?? []), run]);
  }
  return byTask;
}

export function buildTaskCards(runs: NormalizedRun[], query?: string): TaskCardView[] {
  const search = query?.trim().toLowerCase();
  return [...groupTaskRuns(runs).entries()]
    .map(([task, taskRuns]) => {
      const models = groupModels(taskRuns).map(({ model }) => model);
      return {
        task,
        runCount: taskRuns.length,
        modelCount: models.length,
        models,
        representativeRunId: representativeRunId(taskRuns)
      };
    })
    .filter((card) => !search || card.task.toLowerCase().includes(search) || card.models.some((model) => model.toLowerCase().includes(search)))
    .sort((left, right) => compareText(left.task, right.task));
}

export function buildTaskDetail(runs: NormalizedRun[], task: string): TaskDetailView | null {
  const taskRuns = sortRunsNewestFirst(runs.filter((run) => run.task === task));
  if (!taskRuns.length) return null;

  return {
    task,
    runs: taskRuns,
    models: groupModels(taskRuns),
    representativeRunId: representativeRunId(taskRuns)
  };
}

export function resolveComparison(runs: NormalizedRun[], requested: ComparisonRequest = {}): ComparisonSelection {
  const cards = buildTaskCards(runs);
  const tasks = cards.map(({ task, modelCount }) => ({ task, modelCount }));
  if (!tasks.length) return { task: null, leftId: null, rightId: null, tasks, models: [], reason: "no-tasks" };

  const task = tasks.find((candidate) => candidate.task === requested.task)?.task ?? tasks[0].task;
  const detail = buildTaskDetail(runs, task)!;
  const models = detail.models;
  const runsById = new Map(detail.runs.map((run) => [run.id, run]));
  const requestedLeft = requested.leftId ? runsById.get(requested.leftId) ?? null : null;
  const requestedRight = requested.rightId ? runsById.get(requested.rightId) ?? null : null;
  const left = requestedLeft?.model ? requestedLeft : models[0]?.runs[0] ?? null;
  const right = requestedRight?.model && requestedRight.id !== left?.id && requestedRight.model !== left?.model
    ? requestedRight
    : models.find(({ model }) => model !== left?.model)?.runs[0] ?? null;

  return {
    task,
    leftId: left?.id ?? null,
    rightId: right?.id ?? null,
    tasks,
    models,
    reason: left && right ? "ready" : "not-enough-models"
  };
}
