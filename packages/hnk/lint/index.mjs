/**
 * hnk の形を守らせる oxlint のプラグイン。アプリの .oxlintrc.json で
 * `"jsPlugins": ["hnk/lint"]` として読み込む
 */
import layerImports from "./rules/layer-imports.mjs";
import noAwaitInCallArguments from "./rules/no-await-in-call-arguments.mjs";
import noForeignTableReads from "./rules/no-foreign-table-reads.mjs";
import noModuleScopeState from "./rules/no-module-scope-state.mjs";
import routeDeclaresAuth from "./rules/route-declares-auth.mjs";
import routeExportsOnlyTheRouter from "./rules/route-exports-only-the-router.mjs";
import routeRepliesThroughReply from "./rules/route-replies-through-reply.mjs";

export default {
  meta: { name: "hnk" },
  rules: {
    "layer-imports": layerImports,
    "no-foreign-table-reads": noForeignTableReads,
    "route-exports-only-the-router": routeExportsOnlyTheRouter,
    "no-await-in-call-arguments": noAwaitInCallArguments,
    "route-replies-through-reply": routeRepliesThroughReply,
    "no-module-scope-state": noModuleScopeState,
    "route-declares-auth": routeDeclaresAuth,
  },
};
