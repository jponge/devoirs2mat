// React Testing Library only unmounts between tests automatically when vitest's
// `globals` are enabled. They are deliberately off here (see `vite.config.js`),
// so the cleanup is registered explicitly instead.
import { cleanup } from "@testing-library/react";
import { afterEach, vi } from "vitest";

afterEach(cleanup);

// A test that installs fake timers and forgets to restore them corrupts or
// hangs every file that runs after it, which is miserable to trace back.
afterEach(() => vi.useRealTimers());
