#!/usr/bin/env node
/**
 * `pnpm create hnk <dir>` の入口。依存に入っている hono-kit の `hnk init <dir>` を呼ぶだけ
 */
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const cli = path.join(path.dirname(require.resolve("hono-kit/package.json")), "bin/hnk.mjs");

const { status } = spawnSync(process.execPath, [cli, "init", ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(status ?? 1);
