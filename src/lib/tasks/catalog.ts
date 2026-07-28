import melvynxSnapshot from "../../data/melvynx-runs.snapshot.json";
import type { NormalizedRun } from "../sources/types";

export type MelvynxTaskPrompt = { slug: string; path: string };

const prompts: Record<string, MelvynxTaskPrompt> = {
  "3d-sponge-bob": { slug: "spongebob-3d-world-threejs", path: "prompts/spongebob-3d-world-threejs/v2.md" },
  "air-conditioning-understanding": { slug: "threejs-air-conditioning-understanding", path: "prompts/threejs-air-conditioning-understanding/v2.md" },
  "bouncing-ball": { slug: "bouncing-ball-polygon", path: "prompts/bouncing-ball-polygon/v1.md" },
  "car-crash": { slug: "car-brick-wall-crash", path: "prompts/car-brick-wall-crash/v2.md" },
  "distributed-systems-playground": { slug: "distributed-systems-playground", path: "prompts/distributed-systems-playground/v1.md" },
  "earthquake-explorer": { slug: "earthquake-explorer", path: "prompts/earthquake-explorer/v3.md" },
  "elysian-taste-challenge": { slug: "elysian-taste-challenge", path: "prompts/elysian-taste-challenge/v2.md" },
  "figma-clone": { slug: "mini-figma-clone", path: "prompts/mini-figma-clone/v1.md" },
  "gmail-clone": { slug: "gmail-clone", path: "prompts/gmail-clone/v1.md" },
  "little-red-riding-hood-film": { slug: "little-red-riding-hood-film", path: "prompts/little-red-riding-hood-film/v1.md" },
  "living-identity-system": { slug: "living-identity-system", path: "prompts/living-identity-system/v1.md" },
  "one-button-boss-fight": { slug: "one-button-boss-fight", path: "prompts/one-button-boss-fight/v1.md" },
  "orbital-rescue-digital-twin": { slug: "orbital-rescue-digital-twin", path: "prompts/orbital-rescue-digital-twin/v1.md" },
  pentest: { slug: "pentest", path: "prompts/pentest/v1.md" },
  "rocket-launch": { slug: "rocket-launch-animation", path: "prompts/rocket-launch-animation/v1.md" },
  "simulation-life": { slug: "ecosystem-evolution-simulator", path: "prompts/ecosystem-evolution-simulator/v3.md" },
  thumbfast: { slug: "thumbfast-drawing-inspiration-editor", path: "prompts/thumbfast-drawing-inspiration-editor/v3.md" },
  "the-last-signal": { slug: "the-last-signal", path: "prompts/the-last-signal/v2.md" },
  "timezone-checker": { slug: "timezone-checker", path: "prompts/timezone-checker/v1.md" },
  "youtube-thumbnail": { slug: "youtube-thumbnail-generator", path: "prompts/youtube-thumbnail-generator/v1.md" }
};

export const MELVYNX_TASKS: readonly string[] = Object.freeze(
  [...new Set(
    (melvynxSnapshot as NormalizedRun[])
      .map((run) => run.task)
      .filter((task): task is string => Boolean(task))
  )].sort()
);

const melvynxTasks = new Set(MELVYNX_TASKS);

export function isMelvynxTask(task: string): boolean {
  return melvynxTasks.has(task);
}

export function getMelvynxTaskPrompt(task: string): MelvynxTaskPrompt | null {
  return prompts[task] ?? null;
}
