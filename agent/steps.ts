import type { Phase } from "../shared/types.ts";
import { now, updateState } from "../server/store.ts";

/** Append one visible step to a run's activity timeline (the UI polls for these). */
export const step = (
  runId: string,
  phase: Phase,
  action: string,
  extra: { url?: string; detail?: string } = {},
) =>
  updateState((s) => {
    s.runs
      .find((r) => r.id === runId)
      ?.steps.push({ at: now(), phase, action, ...extra });
  });

/** Keep only the latest small browser capture, so the shared demo state stays bounded. */
export async function capture(
  runId: string,
  page: import("playwright-core").Page,
) {
  try {
    const bytes = await page.screenshot({
      type: "jpeg",
      quality: 30,
      scale: "css",
      timeout: 5000,
    });
    if (bytes.length > 65000) return;
    await updateState((s) => {
      for (const run of s.runs) delete run.preview;
      const run = s.runs.find((r) => r.id === runId);
      if (run)
        run.preview = {
          dataUrl: `data:image/jpeg;base64,${bytes.toString("base64")}`,
          url: page.url(),
          at: now(),
        };
    });
  } catch {
    /* Screenshots are optional evidence; do not fail the workflow if a capture is unavailable. */
  }
}
