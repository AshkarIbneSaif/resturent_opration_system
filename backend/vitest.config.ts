import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    testTimeout: 15000,
    globalSetup: ["./tests/globalSetup.ts"],
    setupFiles: ["./tests/setupPerFile.ts"],
    fileParallelism: false,
  },
});
