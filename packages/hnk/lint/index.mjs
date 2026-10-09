/**
 * hnk の形を守らせる oxlint のプラグイン。アプリの .oxlintrc.json で
 * `"jsPlugins": ["hnk/lint"]` として読み込む
 */
import layerImports from "./rules/layer-imports.mjs";
import noAwaitInCallArguments from "./rules/no-await-in-call-arguments.mjs";
import noClockOutsideInbound from "./rules/no-clock-outside-inbound.mjs";
import noForeignTableReads from "./rules/no-foreign-table-reads.mjs";
import noIdCast from "./rules/no-id-cast.mjs";
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
    "no-clock-outside-inbound": noClockOutsideInbound,
    "route-replies-through-reply": routeRepliesThroughReply,
    "no-id-cast": noIdCast,
    "no-module-scope-state": noModuleScopeState,
    "route-declares-auth": routeDeclaresAuth,
  },
};
