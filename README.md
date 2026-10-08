# hnk-next

[hnk](https://github.com/ashunar0/hnk) の作り直しの実験場。Hono の上で「誰が書いても（AI が書いても）同じ形になる」ための仕組みを、パッケージとして作っている。

目指す先は Go。同じ API（invoices の一覧・1件・作成・更新・削除）を Go の定番の書き方でも書いて、並べて比べながら形を決めた。

## 中身

```
packages/hnk/   hnk パッケージ。仕組みと lint のルール
hono/           hnk を使ったアプリ（Hono + Cloudflare Workers + D1）
go/             同じ API を Go（net/http + sqlc）で書いたもの。比較用
conventions.md  Go のサンプルから取り出した慣習 43 項目
memo.md         別の会話でまとめた、Go の設計思想を Hono で再現する話
```

## hnk を使うとこう書く

```ts
// hono/api/modules/invoices/routes.ts
export const invoicesRouter = createRouter()
  // 更新
  .openapi(
    ...createEndpoint(
      createRoute({
        method: "put",
        path: "/{id}",
        middleware: [requireAuth] as const,
        request: {
          params: invoiceParamsSchema,
          body: jsonBody(invoiceInputSchema),
        },
        responses: {
          200: json(invoiceResponseSchema, "更新した請求書"),
          ...errorResponses(NotFound),
        },
      }),
      async (c, reply, { invoices }) => {
        const { id } = c.req.valid("param");
        const input = c.req.valid("json");
        const viewerId = c.get("authUserId");

        const result = await invoices.update(id, viewerId, input);
        if (!result.ok) return reply.failure(result.error);

        return reply(200, invoiceResponse(result.value));
      },
    ),
  );
```

- `responses` がそのエンドポイントの約束。handler は `reply` で返し、約束とずれると、間違えた値そのものに赤線が付く
- `requireAuth` が返しうる 401 と、入力の検査の 400 は自動で宣言される。書くのはドメインの失敗だけ
- handler の引数は「受け取る（`c`）・返す（`reply`）・使う（依存）」の順

```ts
// hono/api/modules/invoices/domain.ts
async update(id, viewerId, input: InvoiceInput): Promise<Result<Invoice, "NOT_FOUND">> {
  const invoice = await repo.updateOwned(id, viewerId, { ...input, updatedAt: new Date() });
  if (invoice === null) return err("NOT_FOUND");

  return ok(invoice);
}
```

- 想定内の失敗は Result で返す。domain は HTTP のステータスを知らない
- 所有者の条件は repo の WHERE に入れて 1 文で書く。他人のものは在ることも知らせず NOT_FOUND
- `Invoice` は domain が宣言するモノの型。repo は DB の行をこれに詰め替えて返す

## 出発点と育ち方

### 出発点: 箱 3 つ

どのアプリにも必ずあるのは、モノ・公開・保存の 3 つだけ。module ごとに 1 箱 1 ファイルで始める。

```
api/modules/invoices/
├─ domain.ts      モノ: 型・ルール・失敗・保存の形の宣言・手順。外を何も知らない
├─ routes.ts      公開: HTTP の入出力の形と、モノ → 応答の変換
└─ repo.d1.ts     保存: テーブルと、D1 での実装。行 → モノの詰め替え
```

```
  routes  ──→  domain  ←──  repo.d1
```

ルールは 1 つ。**矢印は全部 domain に向かう**。アダプター（routes、repo.d1）のファイル名には、何に繋ぐかを書く。

### 育ち方: 2 つ目が現れたときだけ、3 種類

| 動き       | きっかけ                                    | 足すもの                                                                                 |
| ---------- | ------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 横に増える | 2 つ目の入口                                | `cron.ts`、`queue.ts`（routes.ts の隣）                                                  |
| 横に増える | 2 つ目の保存先                              | `files.r2.ts` など。必要な形は domain で宣言する                                         |
| 中で割れる | 1 つのファイルが 2 つ目の理由で変わり始めた | 同じ箱の中で分ける（domain.ts → ports.ts、routes.ts → schema.ts など）。矢印は変わらない |
| 上に載る   | 2 つ目の module が触りにくる                | `index.ts`（公開口）。他の module はここからだけ触る                                     |
| 上に載る   | 1 回の操作で 2 つの module に書く           | `usecases/`                                                                              |

どの動きでも、矢印は domain に向かったまま変わらない。

## 動かす

```sh
pnpm install
cd hono
pnpm typecheck   # 型検査（型テストを含む）
pnpm lint        # hnk/lint のルール

cd ../go
go build ./cmd/api
```

## Go と比べて分かったこと

- **目指す先は Go**。AI は毎回ゼロから読むので、揃っていることが一番効く。書く量は AI が書くので気にしない。
  Rails の「書く量を減らす」は、人間の時間が足りなかった時代の答え
- **Go でも、慣習の 4 分の 3 はお願い**（conventions.md）。会社のコードが揃うのは言語のおかげというより、
  スキーマからの生成・依存の向きの lint・書き方の lint・共通部品・文書（＋DB の制約）を重ねているから。どれも TS でできる
- **Go はディレクトリ構成を決めていない**。置き場所を決めるのは Rails のやり方。
  hnk は「置き場所は Rails のように決め、中身は Go のように明示的に書く」
- **作るヘルパーの基準**: 「それが無いと、どんな間違いが書けてしまうか」を言えるものだけ作る。見た目を変えるだけのものは作らない

## 決めたこと

- **hnk はパッケージとして提供する**。仕組みは `hnk`、アプリの決めごと（失敗の一覧、env、組み立て、middleware）と module はアプリに置く。
  結びつけのためだけのファイルは作らない（`new Hono()` と同じく、使う場所で 1 行）
- **想定内の失敗は Result で返す**。throw は HTTP の入口（未ログイン、入力の形）と想定外だけ。
  どの失敗がありうるかが型に出るのは、Go の `error` より強い
- **route は `createRoute` ＋ `createEndpoint`**（@hono/zod-openapi の上）。`c.json` だとずれたときの赤線が handler の頭に付くので、`reply` で返す
- **失敗は値で、番号と文言を持つ**（`httpError("NOT_FOUND", 404, "…")`）。guard が持つ失敗と ValidationError は自動で宣言する。
  `reply.failure` が受け取れるのは、route に手で書いたドメインの失敗だけ
- **module は domain / routes / repo.<技術> の 3 つで始め、2 つ目が現れたときだけ育てる**（上の「出発点と育ち方」）。
  名前は modules（境界を持ったまとまり）。features は「機能」で、複数のモノにまたがる usecases のほうの言葉なので使わない
- **domain は外を知らない**。import できるのは zod と `hnk/result` だけ。ルールは zod で書き、フロントとも共有する
- **依存は `buildApp(makeDeps)`**。Workers はリクエストをまたいだ I/O を拒むので、組み立てた結果ではなく組み立て方を渡す。
  `provideDeps` がリクエストごとに、使うときに 1 回だけ組み立てる
- **保存の形は domain が宣言する**（Go の「interface は使う側が決める」）
- **lint は `hnk/lint` で提供する**。依存の向きは役割ごとの許可表（`layer-imports`）で守らせる。表に無い import は全部だめで、
  相対 import も tsconfig の paths 経由も同じに見る。他に、routes の export は束 1 本、`createRoute` に認証の指定、`c.json` 禁止、
  引数の中で await しない、モジュールの一番上に変わる状態を置かない

| 役割   | import してよいもの                                                           |
| ------ | ----------------------------------------------------------------------------- |
| domain | zod, hnk/result                                                               |
| routes | hnk, zod, errors, middleware, domain                                          |
| repo   | drizzle-orm, db（型だけ）, domain（型だけ）, 他 module の repo（join のため） |

- **名前は Hono に合わせて `create〜`**。束は `invoicesRouter`

## 未決

- 同じ番号の失敗が 2 つあると、responses のキーがぶつかって片方が消える
- D1 には対話的なトランザクションが無い（`batch` が基本）。マルチテナントを考えるときに効く
- テストの方針（domain は偽物の repo、HTTP は vitest-pool-workers のローカル D1、偽物は外の API だけ、が候補）
- `withViewer` が仮実装で、テストからログイン状態を作れない
- ID のブランド型
- 「育ち方」を lint と生成器にどこまで載せるか。cron.ts など、表に無い役割のファイルはまだ lint の対象外
- conventions.md の hnk 側の列（どの層で縛るか）が空
- この形で実プロダクトを書いてから、hnk 本体（生成器・スキル）に持ち帰る
