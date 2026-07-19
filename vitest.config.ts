import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    // Тот же алиас, что в tsconfig ("@/..." → корень проекта).
    alias: { "@": path.resolve(__dirname) },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
