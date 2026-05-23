import { defineConfig } from "vitest/config"
import path from "path"

export default defineConfig({
  test: {
    environment: "node",
    include: ["**/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov", "json-summary"],
      include: ["lib/**/*.ts"],
      exclude: ["lib/mock-data.ts", "lib/prisma.ts"],
      thresholds: {
        // Core statistical engine — hold to a high bar
        "lib/nrfi-engine.ts":  { lines: 70, functions: 55 },
        "lib/nrfi-models.ts":  { lines: 85, functions: 82 },
        "lib/calibration.ts":  { lines: 90, functions: 85 },
        "lib/weather.ts":      { lines: 90, functions: 90 },
        // Global floor — catches new files shipping with zero tests.
        // API/infrastructure files are intentionally excluded from unit coverage.
        lines:     25,
        functions: 45,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, ".") },
  },
})
