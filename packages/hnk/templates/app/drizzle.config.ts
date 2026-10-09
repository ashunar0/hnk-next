import { defineConfig } from "drizzle-kit";

// テーブルは各 module の outbound（repo.<技術>.ts）にある
export default defineConfig({
  dialect: "sqlite",
  schema: "./api/modules/*/repo.d1.ts",
  out: "./migrations",
});
