# Go の設計思想を Hono (TypeScript) で再現する: ここまでのまとめ

作成日: 2026-10-08

## 0. 目的と前提

- 企業レベルの SaaS バックエンドを想定する
- AI にコードを書かせても「迷わず同じコード・正しいコード」になる環境を作りたい
- 方針は「お願い(ドキュメント)ベース」ではなく「そもそも書けない構造」
- 実装は Hono (TypeScript) を使い、Go の設計思想を再現する
- Go は未経験。Go を理解したうえで Hono に翻訳する方針
- ランタイムは固定しない (Cloudflare Workers / Node など)
- ツールチェーンは pnpm と Vite+ 系を想定 (Bun は見送り寄り)

---

## 1. Go が企業で人気な理由

- 文法が小さい (キーワード約25個)
- goroutine / channel による軽い並行処理
- ビルドが速く、依存なしの単一バイナリで配布できる
- 標準ライブラリとツール (gofmt, test, pprof) が強い
- Docker / Kubernetes / Terraform などインフラ系の実績が豊富
- 後方互換性の約束が強く、長期運用に向く

苦手な領域: CRUD 中心の管理画面 (Rails 等が速い)、機械学習 (Python)、エラー処理の冗長さ、日本の採用市場。

## 2. バックエンドのアーキテクチャ候補

| 方式 | 向く場面 |
|---|---|
| モジュラーモノリス | 小〜中規模チーム。最初はこれが一番コスパが良い |
| マイクロサービス | 独立スケール・独立デプロイが必要になってから |
| イベント駆動 / CQRS | 履歴が重要な領域 (注文、決済など) |

SaaS なら「モジュラーモノリスで始めて、負荷の性質が違う部分 (Webhook 配信、通知、レポート生成、外部連携) だけ後で切り出す」のが王道。

### SaaS で重要なポイント

- **マルチテナント**: 共有テーブル + `tenant_id` + PostgreSQL の RLS が基本。大口顧客だけ物理分離するハイブリッドもある
- 認証は自前実装せず Auth0 / Cognito / Keycloak 等に任せる (SSO は SAML / OIDC)
- 課金は Stripe 等 + Webhook で状態同期
- 非同期処理 (メール、Webhook、集計) はワーカーへ

## 3. チームルールの考え方: 「書けなくする」

AGENTS.md などの文書は「お願い」でありブレる。強い順に次の手段で縛る。

1. **コンパイラ / 型**: ブランド型、未 export の型 + コンストラクタ、`internal` 的な隠蔽
2. **生成コード**: スキーマに無いルートは作れない、SQL に無いクエリは打てない
3. **薄い自社プラットフォーム層**: ルーティング、トランザクション、認証、テナント解決を集約
4. **DB**: RLS、外部キー、CHECK、NOT NULL
5. **ビルド時の検査**: 依存方向の違反でビルドを落とす
6. **禁止 API の lint**: 生の `process.env`、`time.Now()` 相当などを塞ぐ

落としどころ:

- 致命的なもの (テナント分離、認可、トランザクション、課金) は構造的に書けなくする
- スタイルは lint と CI で通らなくする
- AGENTS.md は「地図」程度に短く
- 抜け道は正式に用意しておく (例: lint 無効化には理由コメント必須)
- AI が間違えたら、プロンプトで直すのではなく lint ルールかテストに追記する

## 4. Go の仕組みと TS / Hono の対応表

| Go での手段 | TS での対応 |
|---|---|
| oapi-codegen (スキーマ → ハンドラ) | `@hono/zod-openapi` |
| sqlc (SQL → 型安全コード) | Kysely (+ kysely-codegen) / Drizzle |
| 未 export 型 + コンストラクタ | ブランド型 + 生成関数 |
| `context.Context` で tenant 伝搬 | Hono の `c.var` で明示的に渡す (AsyncLocalStorage も可だがランタイム差に注意) |
| `internal/` と依存方向の強制 | dependency-cruiser |
| forbidigo (禁止 API) | oxlint / ESLint の `no-restricted-imports` `no-restricted-syntax` |
| golangci-lint | oxlint + `tsc --strict` |
| 自社の薄い層 | `defineRoute()` / `defineUseCase()` のようなヘルパー |
| PostgreSQL RLS | そのまま使える |

TS で再現しにくいもの: goroutine 級の軽い並行処理、単一バイナリの軽さ、CPU 重い処理。
TS が有利なもの: フロントとのスキーマ・型共有、ブランド型や判別共用体による「書けなくする」、自分が読めること。

## 5. 根本の考え方 (これが全て)

> 「業務のロジック」と「外の世界 (DB・HTTP・時刻など)」を混ぜない

- 業務ロジックは「こういうことができるもの」(インターフェース) だけを知る
- 実装 (Postgres か SQLite かテスト用か) は外から渡す
- 依存の逆転、ポート & アダプター、`TenantDbProvider` は全部この言い換え

### Go の基本 (コード)

```go
type Order struct {
    ID     string
    Item   string
    Amount int
}

// インターフェース = 「できること」の約束
type StockChecker interface {
    HasStock(item string, amount int) bool
}

// 業務ロジックはインターフェースだけを知る
func CreateOrder(stock StockChecker, item string, amount int) (Order, error) {
    if !stock.HasStock(item, amount) {
        return Order{}, errors.New("在庫が足りません")
    }
    return Order{ID: "o-1", Item: item, Amount: amount}, nil
}

// エラーは戻り値で返す
order, err := CreateOrder(stock, "りんご", 3)
if err != nil {
    return err
}
```

要点:

- 構造体はデータだけ。クラスも継承もない
- インターフェースは `implements` 宣言が不要 (形が合えば満たす。TS の構造的型付けと同じ)
- エラーは例外ではなく戻り値。どこで失敗しうるかがコード上に見える

### TS への翻訳

```ts
type Order = { id: string; item: string; amount: number }

type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: string }

interface StockChecker {
  hasStock(item: string, amount: number): boolean
}

function createOrder(stock: StockChecker, item: string, amount: number): Result<Order> {
  if (!stock.hasStock(item, amount)) {
    return { ok: false, error: "在庫が足りません" }
  }
  return { ok: true, value: { id: "o-1", item, amount } }
}
```

- TS には多値返しがないので `Result` 型 (判別共用体) で表現する。`if (!result.ok)` で分岐すると型が絞り込まれる
- 業務ロジックでは `throw` せず `Result` で返す、というルールは lint で強制する

## 6. Hono での DI: `buildApp` は「依存を受け取る関数」

`new Hono()` をトップレベルに直書きすると本物の DB に固定される。関数で包んで引数で依存を受け取れば差し替えられる。特別なライブラリは不要。

```ts
// modules/orders/routes.ts
export function ordersRoutes(deps: Deps) {
  const r = new Hono()
  r.post("/", async (c) => { /* createOrder(deps, ...) */ })
  return r
}

// app.ts (全ドメインをつなぐ唯一の場所 = Composition Root)
export function buildApp(deps: Deps) {
  const app = new Hono()
  app.route("/orders", ordersRoutes(deps))
  app.route("/users", usersRoutes(deps))
  return app
}

// entry/node.ts
export default buildApp({ stock: realStock, users: realUsers })
```

- `new Hono()` は全体用に 1 つ + ドメインごとのサブルーターに 1 つずつ。エンドポイントごとには作らない
- テストは `app.request("/orders", {...})` で DB もサーバーも不要
- Go の `main()` で依存を組み立てて渡す流れと同じ
- NestJS の DI コンテナは「引数で渡す」を自動化したもの。小〜中規模なら手で渡す方が追いやすい

## 7. 非同期化とブランド型

```ts
type TenantId = string & { readonly __brand: "TenantId" }

function toTenantId(raw: string): TenantId {
  if (raw.length === 0) throw new Error("invalid tenant")
  return raw as TenantId
}
```

- DB アクセスは全て `Promise`。`await` 忘れは `no-floating-promises` / `no-misused-promises` で禁止する
- `TenantId` はただの `string` と区別されるため、渡し忘れや取り違えがコンパイルエラーになる
- テナントの特定は認証ミドルウェアが行い、ハンドラは `c.get("tenantId")` で受け取るだけ

## 8. 入口の検証: Zod と OpenAPI

### Zod を選んだ理由 (Valibot との比較)

- Hono 公式の連携 (`@hono/zod-validator`, `@hono/zod-openapi`) が最も厚い
- 情報量が多く、AI も人間も迷いにくい
- Valibot はバンドルが小さいのが利点。Standard Schema のおかげで将来乗り換える道は残る

### OpenAPI と Hono RPC (`hc`)

- 二者択一ではない。`@hono/zod-openapi` で書けば RPC もそのまま使える
- フロントが TS の自社アプリだけなら RPC で十分。外部公開、他言語クライアント、ドキュメントが必要なら OpenAPI
- SaaS は後から公開 API の要望が来やすいので、最初から `zod-openapi` が安全
- RPC はルートが増えると型推論が重くなりうる。サブルーター分割 + `app.route()` が有利

```ts
const createOrderRoute = createRoute({
  method: "post",
  path: "/",
  request: { body: { content: { "application/json": { schema: CreateOrderBody } } } },
  responses: {
    201: { content: { "application/json": { schema: OrderSchema } }, description: "作成した" },
    409: { content: { "application/json": { schema: ErrorSchema } }, description: "業務エラー" },
  },
})

r.openapi(createOrderRoute, async (c) => {
  const body = c.req.valid("json") // 検証済み
  // ...
})
```

- ルート定義 (契約) とハンドラ (処理) を分ける
- `responses` に無い形を返すと型エラーになる (契約と実装がズレない)
- `app.doc("/openapi.json", {...})` で仕様書を出せる

## 9. ファイル構成: 「ドメインで縦に切り、中を役割で分ける」

```
src/
├─ modules/
│  ├─ orders/
│  │  ├─ domain.ts       # 型と業務ロジック。外を知らない
│  │  ├─ ports.ts        # interface (StockChecker, OrderRepo)
│  │  ├─ schema.ts       # Zod スキーマ
│  │  ├─ routes.ts       # createRoute + ハンドラ (HTTP の翻訳)
│  │  ├─ repo.pg.ts      # Postgres 実装
│  │  ├─ index.ts        # 他モジュールへの公開口
│  │  └─ domain.test.ts
│  └─ users/ (同じ構成)
├─ shared/
│  ├─ tenant.ts          # TenantId
│  └─ result.ts          # Result
├─ app.ts                # buildApp
└─ entry/
   ├─ node.ts
   └─ worker.ts
```

- 「routes/ services/ repos/」のように技術の種類で横に切らない
- 依存の向きは `routes → domain ← repo`。domain は誰にも依存しない
- 最初から全部作らなくてよい。ただし `domain` だけは最初から分ける
- Go の `internal` / 小文字非公開の代わりに、`index.ts` だけ公開して深いパスの import を lint で禁止する

## 10. 依存ルールを機械で強制する

dependency-cruiser の例 (パスは実際の構成に合わせて調整):

- `domain-is-pure`: domain / ports が hono, zod, `node:*` を import したらエラー
- `domain-no-outward`: domain が routes / repo / schema に依存したらエラー
- `no-cross-module-deep-import`: 他モジュールは `index.ts` 経由のみ

```json
{
  "scripts": {
    "lint:deps": "depcruise src --config .dependency-cruiser.cjs",
    "check": "tsc --noEmit && oxlint --type-aware && pnpm lint:deps && vitest run"
  }
}
```

- `pnpm check` 一発で人も AI も同じ検証を通し、CI の必須チェックにする
- ルールを入れたら、わざと違反コードを書いて落ちることを確認する
- ルール名と comment がそのまま AI への修正指示になる

### リンターの現状 (2026-10 時点で調査)

- oxlint の型対応リンティング (`--type-aware`, oxlint-tsgolint) は 2026-07 に安定版になった。`no-floating-promises` 等が使える
- oxlint は ESLint 互換の JS プラグインにも対応 (アルファ段階)。`no-restricted-imports` は `overrides` でフォルダ別に使える
- `no-restricted-syntax` などは `oxlint-plugin-eslint` で使える
- `eslint-plugin-boundaries` が oxlint で動くかは未確認
- dependency-cruiser は依存グラフ、循環参照、未使用ファイル検出で今も価値がある
- 推奨: oxlint (型対応オン) + dependency-cruiser + `tsc --noEmit`

## 11. ランタイムと DB の方針

### ランタイム

- Hono は Web 標準 API の上にあるので Workers / Node / Bun / Deno で動く
- 業務コードは Node 固有 API (`fs`, `Buffer`, `process.env` 直読み) を使わない。domain 層での `node:*` import を lint で禁止
- 環境変数や DB 接続は起動時に型付き `Config` として注入
- ランタイム固有なのは `entry/node.ts` と `entry/worker.ts` の薄いファイルだけ
- 両対応は CI で Node とワーカー (`wrangler dev` / Miniflare / `@cloudflare/vitest-pool-workers`) の両方のテストを回して保証する

### DB

- Go の現場も「DB を決め打ちして、リポジトリのインターフェースで隠す」が主流。方言の吸収は ORM で頑張らず境界で切る
- 「SQL 方言の抽象化」ではなく「テナント分離戦略の抽象化」をする
- 当面は Postgres + RLS に固定し、ランタイムだけ差し替えるのがコスパ良し (Workers からは Hyperdrive 経由)
- D1 / Durable Objects / SQLite のテナント別物理分離は、別アダプターに隔離してオプション扱いにする
- 物理分離の注意点: マイグレーションを全 DB に流す運用、テナント横断クエリ、中央のコントロールプレーン DB
- 契約テスト (どのアダプターでも「他テナントが見えない」「ロールバックされる」を同じテストで検証) が抽象化を嘘にしない鍵

## 12. TenantDb: テナント分離を構造で守る

```sql
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders FORCE ROW LEVEL SECURITY;
CREATE POLICY tenant_isolation ON orders
  USING (tenant_id = current_setting('app.tenant_id'));
```

```ts
declare const tenantDbBrand: unique symbol
export type TenantDb = { readonly [tenantDbBrand]: true }

export interface TenantDbProvider {
  run<T>(tenantId: TenantId, fn: (db: TenantDb) => Promise<Result<T>>): Promise<Result<T>>
}
```

実装 (Postgres) の流れ:

1. トランザクションを開始
2. `set_config('app.tenant_id', tenantId, true)` で、そのトランザクション内だけ有効なテナント設定を入れる
3. 成功なら確定、`Result` のエラーや例外ならロールバック

```ts
async function createOrder(deps: Deps, tenantId: TenantId, item: string, amount: number) {
  return deps.tenantDb.run(tenantId, async (db) => {
    const ok = await deps.stock.hasStock(db, item, amount)
    if (!ok) return { ok: false, error: "在庫が足りません" }
    const order = { id: crypto.randomUUID(), item, amount }
    await deps.orders.save(db, order)
    return { ok: true, value: order }
  })
}
```

「書けなくなったこと」:

- `TenantDb` なしでリポジトリを呼べない
- `TenantDb` は `run` の中でしか作れない (テナント設定の飛ばしが起きない)
- 途中で失敗したら全部ロールバックされる

注意点:

- アプリ用 DB ロールをスーパーユーザーや `BYPASSRLS` 持ちにしない。マイグレーション用とロールを分ける
- 接続プールに前のテナント設定が残らないよう、必ずトランザクション内の設定 (`set_config(..., true)`) を使う
- 「テナント A で保存 → テナント B で読むと空」のテストを必ず書く
- Hyperdrive 等のプール挙動はサービスごとに違うので、採用前に公式の現状を確認する

## 13. 採用前に確認すること

- Vite+ (VoidZero) の最新状況
- dependency-cruiser の設定記法
- oxlint の JS プラグイン (アルファ) の安定度と、依存境界ルールが全て書けるか
- Hyperdrive / D1 / Durable Objects の制約と最新仕様
- 各ライブラリ (Zod, Hono zod-openapi, Kysely など) の現行バージョンでの記法

## 14. 次にやること (候補)

1. 契約テスト: 「他テナントが見えない」を実コードで確認する
2. Swagger / Scalar で OpenAPI ドキュメントを表示する
3. Go の続き: ポインタ、スライス、goroutine、`context`
4. 最小の骨組み (ブランド型 TenantId + TenantDb + defineUseCase) を実際のリポジトリとして作る
5. 小さな API を Go で書き、Hono 版に翻訳して設計思想を体感する

### Go 学習の進め方

1. Tour of Go でひと通り触る
2. `context`、インターフェース、エラー処理、パッケージ設計の 4 点を重点的に理解
3. 小さな API を Go で書く
4. 同じ構造を Hono に翻訳する
