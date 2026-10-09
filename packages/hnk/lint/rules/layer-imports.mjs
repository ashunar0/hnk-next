import {
  fileOf,
  packageOf,
  placeOf,
  projectOf,
  resolveImport,
} from "../project.mjs";
import { HINTS, KINDS, KIND_HINTS, LAYERS } from "../layers.mjs";

/** foreign:domain → 他 module の domain */
const show = (name) => name.replace(/^foreign:/, "他 module の ");

/** 他の module の repo から借りてよい名前。外部キーの表と、読ませる窓口 */
const WINDOW = /(Table|Within)$/;

const isTypeOnly = (node) =>
  node.importKind === "type" ||
  (node.specifiers?.length > 0 &&
    node.specifiers.every((s) => s.importKind === "type"));

/**
 * 役割ごとの依存の向きを、許可の表（LAYERS）で守らせる。
 * Go は package の境界が向きを強制するが、ここでは 1 つの module フォルダに
 * 役割が同居しているので、ファイル名の約束を機械で止める
 */
export default {
  create(context) {
    const file = fileOf(context);
    const project = projectOf(file);
    if (!project) return {};
    const self = placeOf(file, project.root);
    if (self.role === "test") return {};
    const allowed = LAYERS[self.role];
    if (!allowed) {
      if (!self.module) return {};
      // module の中に、役割の分からないファイルを置かせない
      return {
        Program(node) {
          context.report({
            node,
            message: `module の中のファイルは、役割の名前で始める（${Object.keys(KINDS).join(", ")}）。外へ繋ぐものは「役割.技術名.ts」（repo.d1.ts など）`,
          });
        },
      };
    }

    const check = (node) => {
      if (!node.source) return;
      const specifier = node.source.value;
      const resolved = resolveImport(file, specifier, project);

      let target;
      if (resolved === null) target = packageOf(specifier);
      else {
        const place = placeOf(resolved, project.root);
        const foreign = place.module && place.module !== self.module;
        target = foreign ? `foreign:${place.role}` : place.role;
      }
      const kind = allowed[target];
      const targetRole = target.replace(/^foreign:/, "");
      const hint =
        HINTS[`${self.role}→${target}`] ??
        (KINDS[targetRole] && !target.startsWith("foreign:")
          ? KIND_HINTS[`${KINDS[self.role]}→${KINDS[targetRole]}`]
          : undefined);
      if (!kind) {
        const list = Object.entries(allowed)
          .map(([k, v]) => (v === "type" ? `${show(k)}（型だけ）` : show(k)))
          .join(", ");
        context.report({
          node,
          message: `${self.role} が ${show(target)} を import している。${hint ? `${hint}。` : ""}${self.role} が import してよいのは ${list}`,
        });
      } else if (kind === "type" && !isTypeOnly(node)) {
        context.report({
          node,
          message: `${self.role} は ${show(target)} から型だけを借りる。import type にする`,
        });
      } else if (target === "foreign:repo") {
        // 他の module の repo は、外部キーの表と、読ませる窓口だけを外に見せる
        for (const spec of node.specifiers ?? []) {
          const name =
            spec.type === "ImportSpecifier" ? spec.imported.name : undefined;
          if (name !== undefined && WINDOW.test(name)) continue;
          context.report({
            node: spec,
            message: `${self.role} が 他 module の repo から ${name ?? "全部"} を import している。他 module の repo から借りてよいのは、外部キーの表（〜Table）と、読ませる窓口（〜Within）だけ。手順や詰め替えは相手の module の中に置いたまま、必要なら相手に〜Within を足してもらう`,
          });
        }
      }
    };

    return {
      ImportDeclaration: check,
      ExportNamedDeclaration: check,
      ExportAllDeclaration: check,
    };
  },
};
