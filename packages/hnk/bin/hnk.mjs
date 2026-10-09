#!/usr/bin/env node
/**
 * hnk の雛形を出す CLI。
 *   hnk init <dir>          アプリの土台を <dir> に出す（templates/app をコピーするだけ）
 *   hnk g module <name>     module 一式を足し、deps.ts と index.ts につなぐ（templates/module）
 *
 * テンプレートは型検査された実物（scripts/e2e-template.mjs が init → g module → check を通す）。
 * 生成器がするのは、コピーと、語の置き換えと、// hnk: の行の上への追記だけ
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const die = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

// ---- 名前 ----

/** invoices → invoice、categories → category */
const singular = (name) => {
  if (/ies$/.test(name)) return name.replace(/ies$/, "y");
  if (/(s|x|z|ch|sh)es$/.test(name)) return name.replace(/es$/, "");
  if (/s$/.test(name)) return name.replace(/s$/, "");
  return name;
};
const pascal = (name) => name.charAt(0).toUpperCase() + name.slice(1);
const snake = (name) => name.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
const kebab = (name) => name.replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();

/** テンプレートの notes を、渡された複数形の名前に置き換える。長い語から順に */
const rename = (text, plural) => {
  const one = singular(plural);

  return text
    .replaceAll("__snake__", snake(plural))
    .replaceAll("__kebab__", kebab(plural))
    .replaceAll("Notes", pascal(plural))
    .replaceAll("notes", plural)
    .replaceAll("Note", pascal(one))
    .replaceAll("note", one);
};

// ---- ファイル ----

const listFiles = (dir) =>
  fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(dir, path.join(entry.parentPath, entry.name)));

const write = (file, text) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
};

/** `// hnk:<marker>` の行の上に、同じ字下げで足す。同じ行が既にあれば足さない */
const insertAbove = (file, marker, lines) => {
  const source = fs.readFileSync(file, "utf8").split("\n");
  const at = source.findIndex((line) => line.trim() === `// hnk:${marker}`);
  if (at < 0) die(`${file} に // hnk:${marker} の行が無い。生成器がつなげない`);

  const indent = source[at].match(/^\s*/)[0];
  const fresh = lines.filter((line) => !source.some((s) => s.trim() === line.trim()));
  source.splice(at, 0, ...fresh.map((line) => indent + line));
  fs.writeFileSync(file, source.join("\n"));
};

// ---- init ----

const init = (target) => {
  if (!target) die("使い方: hnk init <dir>");
  const dir = path.resolve(target);
  if (fs.existsSync(dir) && fs.readdirSync(dir).length > 0) die(`${dir} は空ではない`);

  fs.mkdirSync(dir, { recursive: true });
  const appName = path.basename(dir);
  // シンボリックリンクを解いた場所どうしで相対にする（/var → /private/var のような所で、相対が 1 段ずれる）
  const spec = `link:${path.relative(fs.realpathSync(dir), fs.realpathSync(root))}`;
  const from = path.join(root, "templates/app");
  for (const file of listFiles(from)) {
    const text = fs
      .readFileSync(path.join(from, file), "utf8")
      .replaceAll("__APP_NAME__", appName)
      .replaceAll("__HNK_SPEC__", spec);
    write(path.join(dir, file), text);
  }

  console.log(`✓ ${dir} に土台を出した`);
  console.log(`  cd ${target} && pnpm install && pnpm check`);
  console.log("  module を足す: hnk g module <複数形の名前>");
};

// ---- g module ----

const generateModule = (plural) => {
  if (!plural || !/^[a-z][a-zA-Z0-9]*$/.test(plural)) {
    die("使い方: hnk g module <name>（camelCase の複数形。例: invoices、signupRequests）");
  }
  if (!fs.existsSync("api/deps.ts") || !fs.existsSync("api/index.ts")) {
    die("アプリのルート（api/deps.ts がある所）で実行する");
  }
  if (fs.existsSync(`api/modules/${plural}`)) die(`api/modules/${plural} は既にある`);

  const from = path.join(root, "templates/module");
  for (const file of listFiles(from)) {
    const text = fs.readFileSync(path.join(from, file), "utf8");
    write(rename(file, plural), rename(text, plural));
  }

  // deps.ts につなぐ。db の import に scopeTo が要る
  const deps = "api/deps.ts";
  fs.writeFileSync(
    deps,
    fs.readFileSync(deps, "utf8").replace('import { wireDb } from "./db";', 'import { scopeTo, wireDb } from "./db";'),
  );
  const one = singular(plural);
  insertAbove(deps, "imports", [
    `import { ${plural}Repository, ${plural}Table } from "./modules/${plural}/repo.d1";`,
    `import { ${plural}Service } from "./modules/${plural}/service";`,
  ]);
  insertAbove(deps, "deps", [
    `const ${plural} = ${plural}Service(${plural}Repository(scopeTo(db, ${plural}Table)));`,
  ]);
  insertAbove(deps, "returns", [`${plural},`]);

  // index.ts につなぐ
  const index = "api/index.ts";
  insertAbove(index, "imports", [`import { ${plural}Router } from "./modules/${plural}/routes";`]);
  insertAbove(index, "routes", [`.route("/${kebab(plural)}", ${plural}Router)`]);

  console.log(`✓ api/modules/${plural}/ を足し、deps.ts と index.ts につないだ（${one} 1 件の CRUD）`);
  console.log("  pnpm db:generate && pnpm exec prettier --write . && pnpm check");
};

// ---- 入口 ----

const [command, ...args] = process.argv.slice(2);

if (command === "init") init(args[0]);
else if (command === "g" && args[0] === "module") generateModule(args[1]);
else die("使い方: hnk init <dir> / hnk g module <name>");
