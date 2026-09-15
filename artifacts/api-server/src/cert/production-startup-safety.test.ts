import assert from "node:assert/strict";
import { startAfterBootstrap } from "../startup";

type FailurePoint = "seed" | "backfill";

async function assertProductionFailsClosed(failurePoint: FailurePoint): Promise<void> {
  const events: string[] = [];
  let exitCode: number | undefined;
  let healthy = false;

  await startAfterBootstrap({
    seedDatabase: async () => {
      events.push("seed");
      if (failurePoint === "seed") throw new Error("synthetic seed failure");
    },
    backfillProducts: async () => {
      events.push("backfill");
      if (failurePoint === "backfill") throw new Error("synthetic backfill failure");
    },
    listen: () => {
      events.push("listen");
      healthy = true;
    },
    isProduction: true,
    exit: (code) => {
      exitCode = code;
    },
    onError: () => events.push("error"),
  });

  assert.equal(exitCode, 1, `${failurePoint} failure must exit non-zero`);
  assert.equal(events.includes("listen"), false, `${failurePoint} failure must not open the listening socket`);
  assert.equal(healthy, false, `${failurePoint} failure must not report the application healthy`);
  assert.equal(events.at(-1), "error", `${failurePoint} failure must be reported`);
}

await assertProductionFailsClosed("seed");
await assertProductionFailsClosed("backfill");
console.log("PASS production startup safety: seed and backfill failures fail closed");