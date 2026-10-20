// The lint worker entry point. docs/cli/lint/README.MD "Parallel execution".

import { parentPort, workerData } from "node:worker_threads";
import { executeJob, failure, setupAddons, type Job, type WorkerInputs } from "./execution.js";

const port = parentPort!;
const data = workerData as WorkerInputs;
try {
  const resource = await setupAddons(data.addon, data.prepared);
  // Serial handling also queues disposal after any active invocation finishes.
  let pending = Promise.resolve();
  port.on("message", (message: { id: number; type: "run" | "dispose"; job: Job }) => {
    pending = pending.then(async () => {
      try {
        if (message.type === "dispose") await resource.dispose();
        else await executeJob(data, message.job, resource.addons, (issue) => port.postMessage({ type: "issue", issue }));
        port.postMessage({ type: "complete", id: message.id });
      } catch (cause) { port.postMessage({ type: "failure", id: message.id, failure: failure(cause) }); }
      finally { if (message.type === "dispose") port.close(); }
    });
  });
  port.postMessage({ type: "complete", id: 0 });
} catch (cause) {
  port.postMessage({ type: "failure", id: 0, failure: failure(cause) });
  port.close();
}
