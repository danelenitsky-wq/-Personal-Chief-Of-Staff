import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
  resolve: {
    tsconfigPaths: true,
    alias: { "server-only": new URL("./tests/server-only-stub.ts", import.meta.url).pathname },
  },
});
