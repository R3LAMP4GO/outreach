import { beforeEach, afterEach, vi } from "vitest";

const TEST_DATABASE_URL = "postgresql://test:test@localhost:5432/test";

// Some modules import the DB client at module-eval time, so this must exist
// before test files are imported.
process.env.DATABASE_URL = TEST_DATABASE_URL;

// `server-only` is a Next.js package that throws when imported from a
// Client Component. Because vitest runs in a test environment (happy-dom)
// that looks like a client environment, importing any module that uses
// `import "server-only"` will fail. Stub it out for tests.
vi.mock("server-only", () => ({}));

beforeEach(() => {
  vi.stubEnv("DATABASE_URL", TEST_DATABASE_URL);
});

afterEach(() => {
  vi.unstubAllEnvs();
});
