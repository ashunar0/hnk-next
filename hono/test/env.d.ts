declare global {
  interface Env {
    /** vitest.config.ts が渡す、マイグレーションの中身 */
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}

export {};
