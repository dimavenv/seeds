import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    // Тот же алиас, что в tsconfig ("@/..." → корень проекта).
    alias: {
      "@": path.resolve(__dirname),
      // "server-only" в Node бросает исключение (он только для бандла Next).
      // Модули lib/* с этим импортом должны тестироваться — подменяем заглушкой.
      "server-only": path.resolve(__dirname, "tests/server-only-stub.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
