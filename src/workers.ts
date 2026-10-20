// The bounded lint worker pool. docs/cli/lint/README.MD "Parallel execution".

import { availableParallelism } from "node:os";
import { Worker } from "node:worker_threads";
import { fail, OperationalError } from "./errors.js";
import type { Failure, Job, WorkerInputs } from "./execution.js";
import type { Issue } from "./output.js";

export type Jobs = number | "auto";
export function jobLimit(value: unknown = "auto"): number {
  if (value === "auto") return Math.min(4, availableParallelism());
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    fail("invalid_jobs", "jobs must be a positive safe integer or auto");
  }
  return value;
}

class Client {
  readonly worker: Worker;
  readonly ready: Promise<void>;
  readonly closed: Promise<void>;
  private pending = new Map<number, { resolve(): void; reject(error: unknown): void }>();
  private nextId = 1;
  private exited = false;
  private disposing = false;

  constructor(data: WorkerInputs, record: (issue: Issue) => void, private abort: (cause: unknown) => void) {
    this.ready = new Promise((resolve, reject) => this.pending.set(0, { resolve, reject }));
    // input-type requires a string entry. A dynamic import works in either
    // input mode and preserves Node's default runtime/loader flag inheritance.
    const entry = new URL("./worker.js", import.meta.url);
    const stringEntry = process.execArgv.some(arg => arg === "--input-type" || arg.startsWith("--input-type="));
    this.worker = new Worker(stringEntry ? `import(${JSON.stringify(entry.href)})` : entry, {
      workerData: data,
      ...(stringEntry ? { eval: true } : {}),
    });
    this.closed = new Promise((resolve) => this.worker.once("exit", () => resolve()));
    this.worker.on("message", (message: { type: string; id: number; issue: Issue; failure: Failure }) => {
      if (message.type === "issue") { record(message.issue); return; }
      const pending = this.pending.get(message.id);
      if (pending === undefined) return;
      this.pending.delete(message.id);
      if (message.type === "failure") {
        const error = new OperationalError(message.failure.code, message.failure.message, message.failure.detail);
        // A failed setup closes its port. Preserve that failure rather than
        // racing its expected exit against the ready promise's rejection.
        if (message.id === 0) this.disposing = true;
        this.abort(error);
        pending.reject(error);
      } else pending.resolve();
    });
    this.worker.on("error", (error) => this.rejectAll(error.message));
    this.worker.on("exit", (code) => {
      this.exited = true;
      if (!this.disposing || this.pending.size > 0) this.rejectAll(`lint worker exited unexpectedly (${code})`);
    });
  }

  private rejectAll(message: string): void {
    const error = new OperationalError("worker_failed", message);
    this.abort(error);
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  private request(type: "run" | "dispose", job?: Job): Promise<void> {
    if (this.exited) return Promise.reject(new OperationalError("worker_failed", "lint worker already exited"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try { this.worker.postMessage({ id, type, job }); }
      catch (cause) { this.pending.delete(id); reject(cause); }
    });
  }

  run(job: Job): Promise<void> { return this.request("run", job); }
  async dispose(): Promise<void> {
    try { await this.ready; }
    catch {
      this.disposing = true;
      await this.worker.terminate();
      return;
    }
    if (this.exited) return;
    this.disposing = true;
    try { await this.request("dispose"); }
    finally {
      // Disposal has settled; leftover addon handles must not keep the run alive.
      await this.worker.terminate();
      await this.closed;
    }
  }
}

export async function runJobs(data: WorkerInputs, jobs: Job[], limit: number, record: (issue: Issue) => void): Promise<void> {
  const clients: Client[] = [];
  let problem: unknown;
  let failed = false;
  const remember = (cause: unknown): void => { if (!failed) { failed = true; problem = cause; } };
  try {
    for (let i = 0; i < Math.min(limit, Math.max(1, jobs.length)); i++) {
      const client = new Client(data, record, remember);
      clients.push(client);
      // Attach immediately so a failure during construction of another worker is observed.
      void client.ready.catch(remember);
    }
    await Promise.all(clients.map((client) => client.ready));
    let next = 0;
    await Promise.all(clients.map(async (client) => {
      while (!failed) {
        const job = jobs[next++];
        if (job === undefined) return;
        try { await client.run(job); }
        catch (cause) { remember(cause); }
      }
    }));
  } catch (cause) { remember(cause); }
  finally {
    const results = await Promise.allSettled(clients.map((client) => client.dispose()));
    for (const result of results) if (result.status === "rejected") remember(result.reason);
  }
  if (failed) {
    if (problem instanceof OperationalError) throw problem;
    fail("worker_failed", `lint worker failed: ${(problem as Error)?.message ?? String(problem)}`);
  }
}
