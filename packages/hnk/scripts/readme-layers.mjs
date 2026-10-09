/**
 * README の許可表を、lint の LAYERS から作る。
 * `node scripts/readme-layers.mjs` で README を書き換え、`--check` では食い違いを調べるだけ
 */
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import * as prettier from "prettier";
import { KINDS, LAYERS, NOTES } from "../lint/layers.mjs";

const readme = fileURLToPath(new URL("../../../README.md", import.meta.url));
const START = "<!-- layers:start";
const START_LINE =
  "<!-- layers:start（packages/hnk/lint/layers.mjs から生成。直接は書き換えない） -->";
const END = "<!-- layers:end -->";

const show = (name) => name.replace(/^foreign:/, "他 module の ");

const table = () => {
  const rows = Object.entries(LAYERS).map(([role, allowed]) => {
    const list = Object.entries(allowed)
      .map(([k, v]) => (v === "type" ? `${show(k)}（型だけ）` : show(k)))
      .join(", ");
    const note = NOTES[role] ? `。${NOTES[role]}` : "";
    return `| ${KINDS[role]} | ${role} | ${list}${note} |`;
  });
  return ["| 側 | 役割 | import してよいもの |", "| --- | --- | --- |", ...rows].join("\n");
};

const before = fs.readFileSync(readme, "utf8");
const start = before.indexOf(START);
const end = before.indexOf(END);
if (start === -1 || end === -1) {
  console.error("README に layers:start / layers:end の印が無い");
  process.exit(1);
}
const merged = `${before.slice(0, start)}${START_LINE}\n\n${table()}\n\n${before.slice(end)}`;
const after = await prettier.format(merged, { filepath: readme });

if (process.argv.includes("--check")) {
  if (after !== before) {
    console.error("README の許可表が layers.mjs とずれている。`pnpm -C packages/hnk readme:layers` で作り直す");
    process.exit(1);
  }
} else {
  fs.writeFileSync(readme, after);
}
