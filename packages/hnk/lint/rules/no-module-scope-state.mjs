import { unwrap } from "../ast.mjs";

/**
 * モジュールの一番上に、変わる状態を置かない。Workers では 1 つの isolate が
 * 同時に複数のリクエストを捌くので、ここに置いたものは全リクエストで共有され、
 * 別の利用者のデータが混ざる。リクエストごとのものは makeDeps か c に置く
 */
export default {
  create(context) {
    const MUTABLE = new Set(["Map", "Set", "WeakMap", "WeakSet", "Array"]);

    return {
      Program(program) {
        for (const statement of program.body) {
          const declaration =
            statement.type === "ExportNamedDeclaration"
              ? statement.declaration
              : statement;
          if (declaration?.type !== "VariableDeclaration") continue;

          if (declaration.kind !== "const") {
            context.report({
              node: declaration,
              message: `モジュールの一番上の ${declaration.kind}。同時リクエストで共有されるので、変わる値は置かない`,
            });
            continue;
          }
          for (const declarator of declaration.declarations) {
            const init = unwrap(declarator.init);
            if (
              init?.type === "NewExpression" &&
              MUTABLE.has(init.callee?.name)
            ) {
              context.report({
                node: declarator,
                message: `モジュールの一番上の new ${init.callee.name}()。同時リクエストで共有されるので、中身が変わる入れ物は置かない`,
              });
            }
          }
        }
      },
    };
  },
};
