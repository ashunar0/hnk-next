/**
 * module の中の役割と、それが core / inbound / outbound のどれか。
 * ここに無い名前のファイルは module の中に置けない（layer-imports が止める）
 */
export const KINDS = {
  domain: "core",
  service: "core",
  commands: "core",
  routes: "inbound",
  webhook: "inbound",
  errors: "inbound",
  cron: "inbound",
  queue: "inbound",
  repo: "outbound",
  gateway: "outbound",
  mailer: "outbound",
  jobs: "outbound",
};

/**
 * 役割ごとに、import してよい相手。ここに無いものは全部だめ。
 * "type" は `import type` だけ許す。実行時には依存せず、形だけを借りる。
 *
 * 矢印は全部 core に向かう。domain は外を何も知らない。
 * service は手順で、outbound の形を宣言する。outbound はその形を満たす。
 * inbound は誰として呼ぶかを決め、deps から core を受け取って呼ぶ。
 *
 * 相手の書き方:
 *   パッケージ名（hnk, hnk/result, zod, drizzle-orm）
 *   自分の module の役割（domain, service, ...）。他の module のものは "foreign:<role>"
 *   アプリの決めごと（errors, middleware, db, deps）
 */
export const LAYERS = {
  // core
  domain: { zod: "value", "hnk/system": "type", "foreign:domain": "type" },
  service: {
    "hnk/result": "value",
    "hnk/page": "type",
    "hnk/system": "type",
    domain: "value",
    "foreign:domain": "type",
  },
  // 他の module に変えさせてよい操作。使う outbound の形は service の宣言を借りる
  commands: {
    "hnk/result": "value",
    "hnk/system": "type",
    domain: "value",
    service: "type",
    "foreign:domain": "type",
  },

  // inbound（HTTP）
  routes: {
    hnk: "value",
    zod: "value",
    errors: "value",
    middleware: "value",
    domain: "value",
  },
  // 利用者のいない HTTP。誰として呼ぶか（システム）は allowSystem から c.get("actor") で受け取る
  webhook: {
    hnk: "value",
    zod: "value",
    errors: "value",
    middleware: "value",
    domain: "value",
  },
  // その module だけの失敗を、HTTP でどう返すか。routes と webhook が使う
  errors: { hnk: "value" },
  // inbound（HTTP 以外）。deps と actor と now は createWorker が渡すので、型を借りるだけ
  cron: { hnk: "type", domain: "type" },
  queue: { hnk: "type", domain: "type" },

  // outbound
  repo: {
    "drizzle-orm": "value",
    "hnk/page": "value",
    db: "type",
    domain: "value",
    service: "type",
    "foreign:repo": "value",
    // 集計の SQL で、他 module の状態の集合（billedStatuses など）を使う
    "foreign:domain": "value",
  },
  gateway: { "hnk/result": "value", domain: "type", service: "type" },
  mailer: { "hnk/result": "value", domain: "type", service: "type" },
  jobs: { domain: "type", service: "type" },
};

/** よくある間違いには、どうすればいいかを添える */
export const HINTS = {
  "domain→service": "domain はモノとルールだけ。手順は service に置く",
  "domain→hnk/result":
    "domain は失敗を返す手順を持たない。手順は service に置く",
  "service→routes":
    "service は HTTP を知らない。失敗は Result のコードで返し、番号は routes が決める",
  "service→hnk":
    "service が hnk から使ってよいのは Result だけ。hnk/result から import する",
  "service→foreign:service":
    "他の module は import しない。使う形を service に宣言し、deps.ts でつなぐ。書くなら相手の commands/ を渡してもらう",
  "routes→foreign:domain":
    'routes は認証した利用者として呼ぶ。システムが要る入口は、middleware に allowSystem を置いて c.get("actor") で受け取る',
  "routes→foreign:errors":
    "他の module の入口の失敗は借りない。自分の service が返す失敗なら自分の domain.ts に Failure として、どの module でも同じ意味のもの（401・403・404）なら api/errors.ts に置く",
  "webhook→foreign:errors":
    "他の module の入口の失敗は借りない。自分の service が返す失敗なら自分の domain.ts に Failure として、どの module でも同じ意味のもの（401・403・404）なら api/errors.ts に置く",
  "routes→foreign:service":
    "他の module の操作は、その流れの持ち主の service から呼ぶ",
  "repo→foreign:service":
    "読みは自分の repo の join で（相手の repo からテーブルを import してよい）",
};

/** 向きの間違いは、役割の組ではなく core / inbound / outbound の組で説明できる */
export const KIND_HINTS = {
  "core→outbound":
    "core は outbound を知らない。必要な形は service に type で宣言し、outbound がそれを満たす",
  "core→inbound":
    "core は inbound を知らない。失敗は Result のコードで返し、HTTP の番号などは inbound が決める",
  "inbound→outbound":
    "inbound は outbound を知らない。deps から core を受け取って呼ぶ",
  "inbound→core":
    "inbound は service や commands を import しない。deps から受け取って呼ぶ",
  "outbound→inbound": "outbound は inbound を知らない",
};

/**
 * 許可表の補足。README の表の「import してよいもの」の後ろに付く。
 * 表そのものは LAYERS から作るので、ここには表で言い切れないことだけを書く
 */
export const NOTES = {
  webhook: "actor（システム）は `allowSystem` から受け取る",
  errors:
    "入口だけの失敗（webhook の署名など）。モノの失敗は domain.ts に Failure として置く。どの module でも同じ意味のもの（401・403・404）は api/errors.ts に置き、routes と webhook はどちらも import してよい",
  cron: "deps・actor・now は createWorker が渡す",
  repo: "他 module の repo からは外部キーの表（〜Table）と読ませる窓口（〜Within）だけ、他 module の domain は SQL の定数と型だけ",
};
