# hnk が目指すもの

> **この文書について**: 2026-10-07〜08 に書いた、hnk の考え方の言語化。**「狙い」「原則」「構造」の節は今も有効**。
> 一方、「route の形」「DI とプラットフォーム」「presenter」の節は、その後 go-vs-hnk での比較と実験で置き換わった（後半の「Go との比較から」に決定がある）。
> 今の設計は [REVIEW.md](../REVIEW.md) と [README.md](../README.md) を見てほしい。ここは経緯の記録として残している。

> 2026-10-07 時点の言語化。どれも実プロダクトで使ってみるまでは仮説で、合わなければ引き直す。

## hnk は何か

Hono で書くときの **置き場所** と **部品の形** を決める規約。全部入りのフレームワークではない。
Rails でいえば、DB やメールを抱えている部分ではなく、MVC として「この形で書く」を決めている部分にあたる。

## 狙い

AI エージェントに書かせても、

- どんなアプリでも同じ形になる
- ミスしにくい。ミスしても、AI 自身が気づいて直せる

前者のために、形を決めるヘルパー（`defineHandler` など）を用意する。
後者のために、守ってほしいことはできるだけ型と lint に寄せる。
縛りの強さは「型 ＞ モジュール境界 ＞ lint ＞ 散文」の順。

AI が自分で直せるかは、エラーの質で決まる。赤線がどこに出るか、何が悪いと書いてあるか。
それも設計の対象にする。

## 原則

- **ブラックボックスにしない**。Rails のような暗黙の挙動は持たない。定義に飛べば中身が追える
- **最小限**。書く量も、覚えることも少なく
- **読んだときに分かる**。人間は普段あまり読まない。それでも、たまに開いたときに一目で分かる
- **こね回さない**。Hono が自然に書ける形の中で綺麗にする。型のために変わった技を持ち込まない

### 見た目はデザインしない。揃えることをデザインする

コードの見た目の大枠は、人間ではなく言語と環境が決めている。
チェーンの形は Hono の型の設計が、折り返しは Prettier の幅が、`({...})(...)` は TS の推論の都合が決める。
ここに逆らうと無理が出る。人間が決められるのは、名前・並べる順番・空行やコメント・ファイルの分け方くらい。

なので hnk は、

1. 言語と Hono が決める範囲の中で、一番マシな形を選ぶ
2. それを生成器で出し、lint で縛って、唯一の形にする

狙いは「AI が書いても同じ形になる」なので、大事なのは形が完璧に綺麗なことより、全部が同じ形で揃っていること。
少しイマイチでも揃っていれば一目で読めるし、ずれればすぐ気づける。

規約の本体は「何を守らせるか」（response を書く、認証を宣言する、presenter を通す……）のほうで、
ここは型と lint で縛る。見た目は、実際に書いて困ったときだけ直す。
見た目の違和感から規約を考え始めると、どの案にも欠点が見つかって「やめるか」に行き着くループになる。

## 構造: 名詞で区切り、What と How に分ける

feature は名詞（ドメイン）で区切る。その中は 2 つに分かれる。

- **What**: そのモノは何か。属性、制約、見せ方
- **How**: それをどうするか。route（外からどう呼ばれるか）・service（どう操作するか）・repository（どう保存して取り出すか）

How の 3 層は Express 以来の定番で、変える理由は薄い。
膨らんでいるのは What のほう。今は table / schema / type / presenter の 4 つに散らばっている。
しかも属性（table と schema）と見せ方（presenter と response schema）は 2 回ずつ書いている。
これを model 1 つに集めたい。

### What の芯はテーブル

バックエンドは DB が中心で、まず決めるのはテーブルの構造。Rails も DB が先。
drizzle ではテーブル定義がそのまま型の出どころになるので、テーブルを唯一の芯にして、他はそこから作る。

ただし、今のテーブル定義は読みにくい。知りたいのは「どんな列があって、何の型か」だけなのに、それ以外が多い。

- 列名を 2 回書く（`ownerId` と `"owner_id"`）
- `.notNull()` だらけ
- 型が直接見えない（`integer(..., { mode: "timestamp_ms" })` が `Date`）
- インデックスや既定値など、DB の都合が混ざる

### ルールの置き場所: そのモノのデータだけで答えが出るか

- **そのモノのデータだけで答えが出る** → model。DB に触らない純関数。例: 所有者か、期限切れか、合計はいくらか
- **DB や他のモノ、手順が要る** → service。例: 存在を確かめてから更新する、他の表も書き換える、メールを送る

model には DB に触らない関数しか入らないので、Fat Model にならない。
model から db / repository を import させない lint を書けば、この線は機械的に守れる。

## 未決

- **テーブルの書き方**: 薄いヘルパー（`string()` / `timestamps()`、`notNull` を既定、`casing` で列名を自動）か、Prisma のような型に近い見た目か。後者はブラックボックスにしないという原則とぶつかる
- **contract との向き**: contract はフロントと共有していて、フロントのフォームも実行時にスキーマを使う。テーブルからスキーマを作ると、contract がテーブルに依存する
- **制約の上乗せ**: 「タイトルは 100 文字以内」はテーブルに無い。どこで足すか
- **presenter**: 「行 → 応答」の層は要るが、`toInvoice` という名前と、毎回通すかどうかがしっくりこない。API における MVC の V にあたる
- **route の形**: 下の「route の形（仮決め）」を PoC で確かめる。CRUD でも、今の route.ts には次の問題がある
  - 1 行目が伸びる
  - チェーンで隙間がない
  - 配線 3 行の繰り返し
  - 値の取り出し方が 3 種類
  - presenter を通すことを強制していない
  - `id` を検証していない
  - 削除の応答が contract に無い
  - 検証エラーが最初の 1 件だけ
  - エラーの形が defineHandler と揃っていない

## route の形

### 今の方針: チェーン＋空行＋defineHandler

```ts
export const invoicesRoute = new Hono<AppEnv>()
  // 更新
  .put(
    "/:id",
    defineHandler({
      param: invoiceIdParamSchema,
      json: updateInvoiceInputSchema,
      response: invoiceResponseSchema,
    })(requireAuth, async (c) => {
      const { id } = c.req.valid("param");
      const input = c.req.valid("json");
      const invoices = wireInvoices(wireDb(c.env.DB));

      const row = await invoices.update(id, c.get("authUserId"), input);

      return toInvoice(row);
    }),
  );
```

- Hono の普通の書き方に一番近い。handler に名前を付けない。handler は「入力 → service → 出力」のつなぎで、How と名前は service にある
- 隙間が無いのは書いていなかっただけ。Prettier はチェーンの間の空行を消さない
- defineHandler で得るもの: 出力の検証（`toInvoice` の通し忘れが型エラー、余分なフィールドが実行時に落ちる、RPC の返り値の型が `response` から決まる）。ほかに検証エラーの全件返し、失敗が RPC の型に混ざらないこと
- 入力は第 2 引数で受けず、今まで通り `c.req.valid()` で取り出す。defineHandler は検証した値を `c.req.valid()` にも入れるので型も付く。分割代入 `(c, { param, query, json })` にすると、`})(` の継ぎ目の行に middleware と受け取る名前が溜まって伸びる。`async (c) =>` なら長さが変わらない
- middleware は 2 段目に可変長で並べる（defineHandler の外、ルートの引数や `.use()` に置くと型が流れない）。増えると継ぎ目が伸びて形が変わるので、オブジェクトに `middleware: []` で書けるのが望ましい。提案するかは保留。Void（npm `void@0.26.0`）の defineHandler も可変長だが、型は流しておらず、検証（`withValidator`）と middleware は組み合わせられない。h3 の `defineHandler` は `middleware: [...]` を配列で受ける
- `onError` に、defineHandler の検証失敗（`HTTPException(400)`、`cause.issues`）を `VALIDATION_ERROR` にする分岐が要る。そうなれば `lib/validator.ts` は要らない
- 気になる点: 短いと 1 行に畳まれて形が長さで変わる（生成器が展開した形で出せば揃う見込み）、インデントが 2 段深い、`})(` の継ぎ目、path の `:id` は defineHandler に届かないので `param` スキーマを書く

これで実プロダクトを書いてみて、残る違和感から次を決める。

### 試して見送った形（2026-10-07）

どれも「RPC の型はルートを 1 か所に集めないと作れない」という同じ壁を、書き方で避けようとしたもの。書き方を変えても壁は動かないので、どこかに無理が出る。

- **defineRoute に名前を付ける**（下の「仮決め」）。型は全部成り立った（PoC あり）が、handler に名前は要らない
- **defineRoutes([...]) で名前なしに並べる**。型は成り立つ（`as const` を忘れると壊れるので関数で包む）が、チェーンと変わらない
- **`asserts this is` で `app.get()` を 1 文ずつ書く**。呼ぶたびに `_schema` を交差させると、チェーンと同じ型になった。`const app: Router` の注釈が必須で、同じファイルの上から下にしか効かない。動くが技として変

PoC は worktree `dev/hono/hono-pr-5531-define` の `src/helper/factory/` にある（define-route-poc.ts / .test.ts、define-route-array.test.ts、asserts-poc.test.ts、未コミット）。

### defineRoute 案（見送り）

1 本のルートを `defineRoute` で宣言する。メソッド・パス・本体を離さない。
handler は薄く、中身は service に任せているので、ルート表と本体を分けても名前を経由して飛ぶ手間が増えるだけ。

```ts
export const updateInvoice = defineRoute({
  method: "PUT",
  path: "/:id",
  handler: {
    middleware: [requireAuth],
    request: {
      param: invoiceIdParamSchema,
      json: updateInvoiceInputSchema,
    },
    response: invoiceResponseSchema,
    fn: async (c, { param, json }) => {
      // service を呼んで、応答の形にして返す
    },
  },
});

export const invoicesRoutes = {
  listInvoices,
  getInvoice,
  createInvoice,
  updateInvoice,
  deleteInvoice,
};
```

- 外側は「どこに来たら」（`method` / `path`）、`handler` は「何をするか」。`app.on(method, path, handler)` と同じ分け方
- 1 本ずつのものを「ルート」と呼ぶ（Hono の `app.routes`、zod-openapi の `createRoute` と同じ）。feature のまとまりは `invoicesRoutes`
- `define` は定義を書くだけ、`create` は実体を作る、という今の流れに合わせる
- `method` は大文字。`app.on()` にそのまま渡せる
- `middleware` は配列。defineHandler は Void に合わせて可変長だが、hnk のラッパーでは配列にする
- 入力は `request` にまとめる。キーは値の出どころ（`param` / `query` / `json` / `form` / `header` / `cookie`）。`req` / `res` は `c.req` / `c.res` と紛らわしいので省略しない
- `response` は defineHandler と同じ名前
- 本体は `fn`。`handler: { handle }` は同じ言葉が続くので避けた
- `handler:` には defineHandler の呼び出しではなく、ただのオブジェクトを書く。呼び出しを入れ子にすると、外側の `path` の型が内側に届かない（PR #5531 の検証で、入れ子では middleware の型が届かなかったのと同じ理由）。ただのオブジェクトなら届くはずなので、PoC で確かめる

まだ見ていない型まわり:

1. `response` の書き忘れ。書かないと RPC の返り値が `unknown` になるので、hnk では必須にしたい
2. `param` の型がパスから来るか、スキーマを毎回書くか
3. `wireInvoices(wireDb(c.env.DB))` の繰り返し
4. 成功のステータス（201 など）が型に乗らない
5. エラーの形。hnk の `{ error: { code, message } }` と defineHandler の `{ error, issues }`

## DI とプラットフォーム（2026-10-07、実験中）

層（route・service・repository）は残す。プラットフォームは Hono と同じく「Cloudflare が既定だが、前提ではない」。

### 見送った案: import で直接つなぐ

`api/db/index.ts` で `import { env } from "cloudflare:workers"; export const db = drizzle(env.DB)` とし、
各層を import でつなぐ案。D1 ではファイルの一番上で作っても読み書きできた（wrangler 4.147 / drizzle-orm 0.45）。
しかし接続を持つ DB（Neon や Hyperdrive 経由の Postgres）では、モジュールの外で作った接続がリクエストをまたいで共有され、Workers では壊れる。
「Cloudflare を知るのは 1 ファイルだけ」が D1 でしか成り立たないので見送った。
フロントがサーバーの型を読むとき、`cloudflare:workers` を解決できない構成があるのも懸念。

### 実験中: 組み立てを `api/deps.ts` に集める（composition root）

db はこれまで通りリクエストごとに作り、各層は 1 つ下を組み立て済みで受け取る。
変えたのは、組み立てを書く場所を `api/deps.ts` の 1 か所にしたこと。

```ts
// api/deps.ts（hnk g feature が getter を 1 本ずつ足す）
export const deps = (c: { env: AppEnv["Bindings"] }) => {
  const db = wireDb(c.env.DB);

  return {
    get invoices() {
      return invoicesService(invoicesRepository(scopeTo(db, invoicesTable)));
    },
  };
};

// route.ts（手で書くのはこの 1 行）
const { invoices } = deps(c);
```

- feature のファイルから `wire*` が消えた。repository と service は「部品を受け取って作る関数」だけ
- 入れ子は長いが、生成器が書くので誰も手で書かない。書いてあるので追えるし、間違えれば型エラーになる
- getter なので、読んだ feature だけが組み上がる
- db そのものは返さない。route が書き込み先を選べてしまうので
- 引数が Context でなく `{ env }` なのは、guard を通って Variables が絞られた `c` も渡せるようにするため

判断の基準は「誰が書くか」と「ミスしたら型で止まるか」。生成器が書くなら長くてよい。
見送ったほかの形:

- **各層が 1 つ下を自分で作る**（`invoicesService(db)`）。一番シンプルだが、repository が db そのものを受け取るので、他のテーブルへの書き込みを型で止められない
- **部品を並べたオブジェクト＋`defineDeps`**。縛りは残るが、生成器が書く入れ子を隠すために仕組みを 1 つ増やす得が小さい
- **DI コンテナ（NestJS など）**。組み立てがコードに書かれず追えない。登録漏れが実行時エラーになる。`emitDecoratorMetadata` は esbuild が対応していない

ブランチ `experiment/deps-composition-root` で入れた。実際に使って、長さが邪魔ならオブジェクト案へ、縛りが lint で十分なら「各層が自分で作る」案へ移る。

## presenter（2026-10-08）

presenter は「ドメインの言葉（行）を API の言葉（応答の形）に翻訳する係」。
見せ方は HTTP の約束の都合なので service には置かない（cron や use case から呼ぶと、Date のままや ownerId が欲しい）。

- **名前は作る型と同じにして、小文字始まり**: `invoiceResponse(row)` / `listInvoicesResponse(rows)`。
  `toInvoice` は、行も最初から Invoice なので「何に変えるか」が言えていなかった。
  `String(123)` と同じく「型の名前の関数に渡すと、その型になって返る」形。大文字始まりはクラスと紛らわしいので避けた
- **今は毎回通す**: defineHandler が使えるまで、出力の形を守るのは presenter の戻り値の型だけ
- **defineHandler が入ったら**: 隠すだけなら `response:` が余分な列を落とすので要らなくなる。
  変える（Date → 数値）・足す（canEdit など）があるときは残る。毎回書くか要るときだけ書くかは、そのとき決める
- 見送った名前: `toResponse`（`to` が変）、`InvoiceResponse.from(row)`、`InvoiceResource.one(row)`（Laravel 流。REST の「リソース」と紛らわしい）、クラスで `new`

## 次に考えること（2026-10-08 時点）

> この後、下の「Go との比較から」で、ドメインのエラー・入力のルール（What の一部）・使う側の interface は形が出た。ID のブランド型は未着手。

他の言語・フレームワークから、コードの質の観点で借りられるもの。

- **ドメインのエラー**（Go のエラーの扱い）: 今の service は `forbidden()`（403）や `notFound()`（404）を投げていて、HTTP のステータスを知っている。cron や use case から呼ぶと意味が通らない。service は「所有者ではない」のようなドメインのエラーを投げ、何番にするかは `onError` が決める形にしたい。次に最初に考える
- **What（model）をまとめる**（Rails の Model、DDD のエンティティ）: 型と、そのモノのデータだけで答えが出るルールを 1 か所に。テーブルを芯にする話と、属性の二重定義（table と contract）の解消も含む
- **ID のブランド型**（Go の名前付き型）: `invoices.update(viewerId, id, input)` と順番を取り違えても今はコンパイルが通る
- **インターフェースは使う側が決める**（Go）: service が必要な読み書きの形を宣言し、repository がそれに合わせる。service が repository のファイルを知らなくて済む

位置づけとしては「Hono の上で Go のようなこと（隠さず、生成して見せる）をやる」。
Go ほど綺麗にならない部分は、TS に `internal/` が無いこと、Workers でリクエストごとに組み立てること、RPC の型推論（チェーン、throw）から来ていて、
後の 2 つは「どのプラットフォームでも動く」「コード生成なしでフロントまで型が通る」と引き換えに選んだもの。

## Go との比較から（2026-10-08）

同じ API（invoices）を Go の定番の書き方と hnk で書いて並べ、hnk 側を作り直した。
比較用のプロジェクトは `dev/hono/go-vs-hnk/`（`go/`、`hono/`、`packages/hnk`）。経緯はそのコミット履歴にある。
ここでの決定は、上の節のいくつか（失敗は throw、lib をコピー、defineHandler 待ち、deps(c)）を置き換える。

### 分かったこと

- **目指す先は Go**。AI は毎回ゼロから読むので、揃っていることが一番効く。書く量は AI が書くので気にしない。
  Rails の「書く量を減らす」は、人間の時間が足りなかった時代の答え
- **Go でも、慣習の 4 分の 3 はお願い**（`go-vs-hnk/conventions.md` の 43 項目）。会社のコードが揃うのは言語のおかげというより、
  スキーマからの生成・依存の向きの lint・書き方の lint・共通部品・文書（＋DB の制約）を重ねているから。どれも TS でできる
- **Go はディレクトリ構成を決めていない**。置き場所を決めるのは Rails のやり方。
  hnk は「置き場所は Rails のように決め、中身は Go のように明示的に書く」
- **作るヘルパーの基準**: 「それが無いと、どんな間違いが書けてしまうか」を言えるものだけ作る。見た目を変えるだけのものは作らない

### 決めたこと

- **hnk はパッケージとして提供する**。lib をコピーする作りはやめる。仕組みは `hnk`、アプリの決めごと（失敗の一覧、env、組み立て、middleware）と feature はアプリに置く。
  結びつけのためだけのファイルは作らない（`new Hono()` と同じく、使う場所で 1 行）
- **想定内の失敗は Result で返す**。throw は HTTP の入口（未ログイン、入力の形）と想定外だけ。
  失敗が戻り値の型に出て、処理を飛ばすと型エラーになる。どの失敗がありうるかを列挙できるのは Go より強い
- **route は `createRoute` ＋ `createEndpoint`**（zod-openapi の上）。`responses` がそのエンドポイントの約束で、handler は `reply` で返す。
  `c.json` だとずれたときの赤線が handler の頭に付くが、`reply` は間違えた値そのものに付く。defineHandler を待つのはやめる
- **失敗は値で、番号と文言を持つ**（`httpError("NOT_FOUND", 404, "…")`）。guard が持つ失敗（`requireAuth` なら Unauthorized）と、
  入力があるときの ValidationError は、responses に自動で足される。route に書くのはドメインの失敗だけで、`reply.failure` が受け取れるのもそれだけ
- **入力のルールは `contract/<feature>/model.ts`**。zod の brand で、検査を通った値だけを service が受け取る。cron などから生の値を渡すと型エラー
- **依存は `buildApp(makeDeps)`**。組み立てた結果ではなく、組み立て方を渡す（Workers はリクエストをまたいだ I/O を拒むので）。
  `provideDeps` がリクエストごとに、使うときに 1 回だけ組み立て、handler は `(c, reply, { invoices })` で受け取る。受け取る・返す・使うが引数の位置で決まる
- **repository の形は service が宣言する**。repository.ts がそれを満たす。行の型は table.ts に置く
- **lint は `hnk/lint` で提供する**。route の export は束 1 本、`createRoute` に認証の指定、`c.json` 禁止、引数の中で await しない、
  他 feature の repository に触らない、service が repository を import しない、モジュールの一番上に変わる状態を置かない、
  feature は hono と zod を直接 import しない（zod は contract/ だけ）
- **名前は Hono に合わせて `create〜`**。`createRouter` / `createEndpoint` / `createRoute`。束は `invoicesRouter`（route は宣言だけを指す）

### 未決・メモ

- 同じ番号の失敗が 2 つあると、responses のキーがぶつかって片方が消える（guard の 403 とドメインの 403 など）
- D1 には対話的なトランザクションが無い（`batch` が基本）。マルチテナントや TenantDb を考えるときに効く
- テストの方針の候補: service は偽物の repository で関数として呼ぶ。HTTP は vitest-pool-workers でローカルの本物の D1。偽物にするのは外の API だけ
- `withViewer` が仮実装なので、テストからログイン状態を作れない。認証が入るときに、セッションを解く部分も外から渡せるようにする
- presenter の節は defineHandler 前提で書いてあり、古い。ID のブランド型は未着手
- 本体（生成器、スキル、fixture）への反映はまだ。go-vs-hnk の形で実プロダクトを書いてから持ち帰る
