declare global {
  /** vite の import.meta.glob。vite は直接の依存ではないので、使う形だけ宣言する */
  interface ImportMeta {
    glob(pattern: string, options: { eager: true }): Record<string, Record<string, unknown>>;
  }

  interface Env {
    /** vitest.config.ts が渡す、マイグレーションの中身 */
    TEST_MIGRATIONS: import("cloudflare:test").D1Migration[];
  }
}

export {};
