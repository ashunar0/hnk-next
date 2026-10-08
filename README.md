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
// hono/api/features/invoices/route.ts
export const invoicesRouter = createRouter()
  // 更新
  .openapi(
    ...createEndpoint(
      createRoute({
        method: "put",
        path: "/{id}",
        middleware: [requireAuth] as const,
        request: { params: invoiceParamsSchema, body: jsonBody(updateInvoiceInputSchema) },
        responses: {
          200: json(invoiceResponseSchema, "更新した請求書"),
          ...errorResponses(NotFound, NotOwner),
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
// hono/api/features/invoices/service.ts
async update(id, viewerId, input: InvoiceInput): Promise<Result<InvoiceRow, "NOT_FOUND" | "NOT_OWNER">> {
  const current = await repo.findById(id);
  if (current === null) return err("NOT_FOUND");
  if (current.ownerId !== viewerId) return err("NOT_OWNER");
  ...
}
```

- 想定内の失敗は Result で返す。service は HTTP のステータスを知らない
- `InvoiceInput` は zod の brand 付き。検査を通っていない値は渡せない

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

- **hnk はパッケージとして提供する**。仕組みは `hnk`、アプリの決めごと（失敗の一覧、env、組み立て、middleware）と feature はアプリに置く。
  結びつけのためだけのファイルは作らない（`new Hono()` と同じく、使う場所で 1 行）
- **想定内の失敗は Result で返す**。throw は HTTP の入口（未ログイン、入力の形）と想定外だけ。
  どの失敗がありうるかが型に出るのは、Go の `error` より強い
- **route は `createRoute` ＋ `createEndpoint`**（@hono/zod-openapi の上）。`c.json` だとずれたときの赤線が handler の頭に付くので、`reply` で返す
- **失敗は値で、番号と文言を持つ**（`httpError("NOT_FOUND", 404, "…")`）。guard が持つ失敗と ValidationError は自動で宣言する。
  `reply.failure` が受け取れるのは、route に手で書いたドメインの失敗だけ
- **入力のルールは `contract/<feature>/model.ts`**。zod の brand で、検査を通った値だけを service が受け取る
- **依存は `buildApp(makeDeps)`**。Workers はリクエストをまたいだ I/O を拒むので、組み立てた結果ではなく組み立て方を渡す。
  `provideDeps` がリクエストごとに、使うときに 1 回だけ組み立てる
- **repository の形は service が宣言する**（Go の「interface は使う側が決める」）
- **lint は `hnk/lint` で提供する**。route の export は束 1 本、`createRoute` に認証の指定、`c.json` 禁止、引数の中で await しない、
  他 feature の repository に触らない、service が repository を import しない、モジュールの一番上に変わる状態を置かない、
  feature は hono と zod を直接 import しない
- **名前は Hono に合わせて `create〜`**。束は `invoicesRouter`

## 未決

- 同じ番号の失敗が 2 つあると、responses のキーがぶつかって片方が消える
- D1 には対話的なトランザクションが無い（`batch` が基本）。マルチテナントを考えるときに効く
- テストの方針（service は偽物の repository、HTTP は vitest-pool-workers のローカル D1、偽物は外の API だけ、が候補）
- `withViewer` が仮実装で、テストからログイン状態を作れない
- presenter の扱い、ID のブランド型
- conventions.md の hnk 側の列（どの層で縛るか）が空
- この形で実プロダクトを書いてから、hnk 本体（生成器・スキル）に持ち帰る
