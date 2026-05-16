/**
 * Thin wrapper around Bun.spawn for running external CLIs with a timeout.
 *
 * Extracted from the SEO report handler so tests can `vi.mock("../run-cli")`
 * without needing the Bun global at all (vitest runs on Node — Bun is undefined).
 *
 * Lazily reads `globalThis.Bun` at call time so a missing runtime fails with a
 * clear error rather than crashing at module-eval.
 */

// Minimal Bun.spawn shape — the project does not depend on @types/bun.
interface BunSpawnOptions {
  cmd: string[];
  stdout?: "pipe" | "inherit" | "ignore";
  stderr?: "pipe" | "inherit" | "ignore";
  stdin?: "pipe" | "inherit" | "ignore";
  env?: Record<string, string | undefined>;
  cwd?: string;
}

interface BunSubprocess {
  exited: Promise<number>;
  stdout: ReadableStream<Uint8Array> | null;
  stderr: ReadableStream<Uint8Array> | null;
  kill(signal?: string | number): void;
}

interface BunRuntime {
  spawn(opts: BunSpawnOptions): BunSubprocess;
}

function getBun(): BunRuntime {
  const bun = (globalThis as unknown as { Bun?: BunRuntime }).Bun;
  if (!bun || typeof bun.spawn !== "function") {
    throw new Error(
      "Bun runtime is required to spawn the SEO report CLI. " +
        "Run the worker with `bun scripts/worker.ts` (not node).",
    );
  }
  return bun;
}

export interface CliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/**
 * Spawn `argv` and wait up to `timeoutMs` for it to exit. On timeout the
 * process receives SIGTERM. Always reads stdout + stderr to completion so the
 * child's pipes don't block.
 */
export async function runCli(argv: string[], timeoutMs: number): Promise<CliResult> {
  if (argv.length === 0) {
    throw new Error("runCli: argv must have at least one element");
  }

  const proc = getBun().spawn({
    cmd: argv,
    stdout: "pipe",
    stderr: "pipe",
    stdin: "ignore",
  });

  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    try {
      proc.kill("SIGTERM");
    } catch {
      // best-effort
    }
  }, timeoutMs);

  let exitCode: number;
  try {
    exitCode = await proc.exited;
  } finally {
    clearTimeout(timer);
  }

  const stdout = proc.stdout ? await new Response(proc.stdout).text() : "";
  const stderr = proc.stderr ? await new Response(proc.stderr).text() : "";

  return { exitCode, stdout, stderr, timedOut };
}
