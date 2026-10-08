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
      {
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
      },
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
// hono/api/modules/invoices/service.ts
async update(id, viewerId, input: InvoiceInput): Promise<Result<Invoice, "NOT_FOUND">> {
  const invoice = await repo.updateOwned(id, viewerId, { ...input, updatedAt: new Date() });
  if (invoice === null) return err("NOT_FOUND");

  return ok(invoice);
}
```

- 想定内の失敗は Result で返す。service は HTTP のステータスを知らない
- 所有者の条件は repo の WHERE に入れて 1 文で書く。他人のものは在ることも知らせず NOT_FOUND
- `Invoice` は domain が宣言するモノの型。repo は DB の行をこれに詰め替えて返す

## 出発点と育ち方

### 出発点: core・inbound・outbound

module は 3 つの側からなる。ヘキサゴナルアーキテクチャの分け方と同じ。

| 側           | 何か                                                 | 今あるファイル               |
| ------------ | ---------------------------------------------------- | ---------------------------- |
| **core**     | そのモノが何で、何ができるか。外を何も知らない       | domain, service, commands    |
| **inbound**  | 外から呼ばれる側。誰として呼ぶかを決めて core に渡す | routes, webhook, cron, queue |
| **outbound** | 外へ出ていく側。core が宣言した形を満たす            | repo, gateway, mailer, jobs  |

出発点は、どの module にも毎回ある 4 ファイル。core は What（domain）と How（service）に分けて始める。手順はどの module にも毎回あるので、最初から分けておく。

```
api/modules/invoices/
├─ domain.ts      core（What）: 型・ルール（検査済みの印付き）。外を何も知らない
├─ service.ts     core（How）: 手順と、手順が必要とする outbound の形の宣言
├─ routes.ts      inbound: HTTP の入出力の形と、モノ → 応答の変換
└─ repo.d1.ts     outbound: テーブルと、D1 での実装。行 → モノの詰め替え
```

```
  routes ──────→ domain ←────── repo.d1
                   ↑               │
                service ←──────────┘ （service が宣言した形を、型だけ借りて満たす）
```

ルールは 1 つ。**矢印は全部 core に向かう**。inbound は service を import せず、deps から受け取る。
inbound と outbound のファイル名には、何に繋ぐかを書く（`repo.d1.ts`、`gateway.stripe.ts`）。

### 育ち方: 2 つ目が現れたときだけ、3 種類

| 動き         | きっかけ                                      | 足すもの                                                                                  |
| ------------ | --------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 横に増える   | 2 つ目の inbound（cron、キュー、webhook）     | `cron.ts`、`queue.ts`、`webhook.stripe.ts`（routes.ts の隣）                              |
| 横に増える   | 2 つ目の outbound（保存先、外部 API、メール） | `files.r2.ts`、`gateway.stripe.ts` など。必要な形は service で宣言する                    |
| 中で割れる   | 1 つのファイルが 2 つ目の理由で変わり始めた   | 同じ箱の中で分ける（service.ts → ports.ts、routes.ts → schema.ts など）。矢印は変わらない |
| 窓口を開く   | 他の module が書きに来る                      | 書かれる側の `commands/<操作>.ts`（1 操作 1 ファイル）。routes からは呼ばない             |
| （足さない） | 他の module が読みに来る                      | 使う側の service が形を宣言し、deps.ts で相手の service をつなぐ                          |

どの動きでも、矢印は domain に向かったまま変わらない。

module をまたぐ流れは、その流れの持ち主（主語）の service が持つ。1 回の書き込みで変えるのは 1 つの module だけにし、
相手の module には、相手が開いた `commands/` を通して頼む。まとめて取り消す仕組みが無いので、どの書き込みも何度やっても同じ結果にしておく。

## 動かす

```sh
pnpm install
cd hono
pnpm typecheck   # 型検査（型テストを含む）
pnpm lint        # hnk/lint のルール
pnpm test        # ローカルの D1 で動かすテスト（vitest + @cloudflare/vitest-plugin）
pnpm check       # 上の 3 つと format:check、hnk の lint ルールのテストを順に回す。AI には「これを通して」と言う 1 つのコマンド

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
- **呼び出し側が別の道に進める失敗は Result、進めない失敗は throw**。再試行・案内・代替ができるもの
  （見つからない、権限が無い、決済サービスやメールが答えない）は Result で返す。DB が落ちたなど、どうしようもないものは throw。
  HTTP の入口の失敗（未ログイン、入力の形）も throw して onError に任せる。どの失敗がありうるかが型に出るのは、Go の `error` より強い
- **外への副作用は「先に記録 → 外へ → 結果で確定」**。外に出る前に記録があるので、何が起きたかを後から辿れる。
  外が冪等キーを受けるなら渡す（Stripe には paymentId、Resend には督促の日付入りのキー）。
  途中で落ちたときに「重複してもよい」か「欠けてもよい」かは業務の判断なので、service のコメントに書く
- **module の依存は一方向**。users ← invoices ← payments、invoices ← reminders、invoices と payments ← reports。
  deps.ts は上から順に const で組み立てる（Go の main と同じ）。依存する相手を先に書かないと、tsc が「宣言の前に使っている」で止めるので、輪はコンパイルが通らない。
  getter で遅延する案は、宣言順の保証を失うので外した（組み立ては関数を返すだけで軽い）。deps.ts は何を import してもよい場所で、lint の表には入れていない
- **route は `createEndpoint(設定, handler)` 1 つで書く**（@hono/zod-openapi の上）。設定は zod-openapi の route の宣言と同じ形で、guard が持つ失敗と ValidationError を hnk が足す。`c.json` だとずれたときの赤線が handler の頭に付くので、`reply` で返す。`createRoute` は公開しない（書き方を 1 つにするため）
- **失敗は値で、番号と文言を持つ**（`httpError("NOT_FOUND", 404, "…")`）。guard が持つ失敗と ValidationError は自動で宣言する。
  `reply.failure` が受け取れるのは、route に手で書いたドメインの失敗だけ。同じ番号の失敗が複数あっても 1 つの応答にまとめ、コードごとの文言で返す
- **利用者とシステムには印を付ける**（`unique symbol`）。`{ kind: "system" }` のようなリテラルでは書けず、利用者を作れるのは `authenticatedUser` だけ。システムの型と値は hnk が持ち、アプリは作れず受け取るだけ（下の「HTTP 以外の入口」）
- **module は domain / service / routes / repo.<技術> で始め、2 つ目が現れたときだけ育てる**（上の「出発点と育ち方」）。
  名前は modules（境界を持ったまとまり）。features は「機能」で、複数のモノにまたがる操作の言葉なので使わない
- **domain は外を知らない**。import できるのは zod だけ。ルールは zod で書き、フロントとも共有する。手順（How）は service に分ける
- **入力は検査済みの印（zod の brand）付きでしか service に渡せない**。どの入口から呼んでも、検査を飛ばすと型エラーになる
- **service は hono を知らない**。hnk から使うのは `hnk/result` だけ
- **依存は `buildApp(makeDeps)`**。Workers はリクエストをまたいだ I/O を拒むので、組み立てた結果ではなく組み立て方を渡す。
  `provideDeps` がリクエストごとに、使うときに 1 回だけ組み立てる
- **outbound の形は service が宣言する**（Go の「interface は使う側が決める」）
- **lint は `hnk/lint` で提供する**。module の中のファイルは、名前の頭（役割）で core / inbound / outbound に分ける。
  役割の分からないファイルは置けない。依存の向きは役割ごとの許可表（`layer-imports`）で守らせ、表に無い import は全部だめ。
  相対 import も tsconfig の paths 経由も同じに見る。HTTP の inbound（routes と webhook）には、export は束 1 本、
  `createEndpoint` に認証の指定、`c.json` 禁止、引数の中で await しない、を求める。どこでも、モジュールの一番上に変わる状態を置かない

| 側       | 役割     | import してよいもの                                                                                                                                          |
| -------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| core     | domain   | zod, hnk/system（型だけ）, 他 module の domain（型だけ）                                                                                                     |
| core     | service  | hnk/result, domain, 他 module の domain（型だけ）                                                                                                            |
| core     | commands | hnk/result, domain, service（型だけ）, 他 module の domain（型だけ）                                                                                         |
| inbound  | routes   | hnk, zod, errors, middleware, domain                                                                                                                         |
| inbound  | webhook  | routes と同じ。system は `allowSystem` から受け取る                                                                                                          |
| inbound  | cron     | hnk（型だけ）, domain（型だけ）。deps・system・now は createWorker が渡す                                                                                    |
| inbound  | queue    | cron と同じ                                                                                                                                                  |
| outbound | repo     | drizzle-orm, db（型だけ）, domain, service（型だけ）, 他 module の repo（範囲付きの読みと、外部キーの references() だけ）, 他 module の domain（SQL の定数） |
| outbound | gateway  | hnk/result, domain（型だけ）, service（型だけ）                                                                                                              |
| outbound | mailer   | gateway と同じ                                                                                                                                               |
| outbound | jobs     | domain（型だけ）, service（型だけ）                                                                                                                          |

- **名前は Hono に合わせて `create〜`**。束は `invoicesRouter`
- **一覧のページ送りは hnk の部品**（`hnk/page` と `pageQuery` / `pageResponseSchema` / `pageResponse`）。
  一覧は `PageQuery`（`limit` は必須）を受け取って `Page` を返す。query に展開すると `limit` に既定（20）と上限（100）が付く。
  repo は `limit + 1` 件読んで `toPage` に渡す。部品を使わない一覧を書くことは、まだ止めていない（AI に書かせる実験で確かめてから決める）
- **ログイン状態は `buildApp(makeDeps, authenticate)` で差し込む**。`authenticate` は viewer（未ログインは null）を文脈に積む middleware で、
  本番は `withViewer`（認証の提供元ができるまでは仮実装）、テストは `appAs(user)`（`test/fixtures.ts`）で本物の deps と D1 のまま利用者だけ差し替える。
  route 層は HTTP 越しに試せる（`test/invoices-http.test.ts`）
- **HTTP 以外の入口は `createWorker` に渡す**（`index.ts` に 1 つ）。deps は呼び出しごとに 1 回組み立て、`system` と `now` を渡す。
  `now` は scheduled なら予定の時刻、queue ならメッセージが積まれた時刻（再送が日をまたいでも同じ日の督促になる）。
  queue の handler は Result を返すだけ: ok で ack、err で retry、想定外の throw はそのメッセージだけ retry にして同じバッチの残りは続ける。
  cron・queue のファイルは `system` を import せず受け取るだけ。システムの値を作る場所は hnk の中に 1 つ（テストは `hnk/testing`）。
  署名つき webhook は `allowSystem` を宣言して `c.get("system")` で受け取る（署名を確かめた後に使う）
- **組織は User が持ち、範囲（Reach）がデータで運ぶ**。システムは全組織、admin は自分の組織の全員分、member は自分の分だけ。
  どの範囲も組織の線を越えない
- **共有は同じ組織の中で、閲覧と編集の 2 段階**。member の範囲は「自分のもの＋共有されたもの」。
  repo が範囲を解釈し、行と一緒に access（`manage` / `edit` / `view`）を返す。`canEdit` と `canManage` は access を受け取る純関数。
  共有できるのは所有者と組織の admin。見えない人には在ることも分からない（NOT_FOUND）、見えるが権限が足りないときは FORBIDDEN
- **他の module に見せる読みは、範囲付きの入口（`invoicesWithin(db, reach)` など）だけ**。範囲が必須引数なので、付け忘れが書けない。
  生の表は読みに使わせない（lint `no-foreign-table-reads`。外部キーの `references()` の中だけ許す）。
  `〜Within` は repo の export から自動で拾い、`test/reads-contract.test.ts` が「他の組織のデータが出ない」を全部に当てる。
  読みを足したら、その表の行を seed に足さないとテストが落ちる
- **読みの線引き**: 状態の意味や業務のルールが入るもの（期限切れ、請求済みなど）は持ち主が答える（`isRemindable`、`billedStatuses`）。
  形を変えるだけの集計（月ごとにまとめる）は読み側が、範囲付きの入口から書く。ここは機械で止められないので、レビューで見る

## 新しい module を足すとき

invoices と同じ形で書く。迷いやすい所は、次のとおりに揃える（comments を AI に書かせた実験で、書き手が迷った所。`docs/09.md`）。

| 迷うこと                               | 決まり                                                                                                                                                                                                                                                                                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 置き場所                               | `modules/<名前>/` に `domain / service / routes / repo.d1` の 4 つで始める。増やすのは 2 つ目が現れたとき                                                                                                                                                                                                                                            |
| 他の module を使う                     | import しない。使う側の service が必要な形を宣言し（戻りは使う分だけ。例: `{ id: string }`）、`deps.ts` でつなぐ。`deps.ts` は依存する相手を先に書く                                                                                                                                                                                                 |
| 他の module の表                       | 外部キーの `references()` の中でだけ使う。読むときは、持ち主が出している `〜Within(db, reach)` を使う                                                                                                                                                                                                                                                |
| 親の下にぶら下がるもの（コメントなど） | 親が見えるかを、親の service に問い合わせる（`get(id, viewer)` の形を宣言）。子に orgId は持たせない。親が見えれば読める・書ける。もっと厳しい権限が要るなら、親が access を返す問いを宣言する                                                                                                                                                       |
| 子の router                            | 親の prefix に mount する（`.route("/invoices", commentsRouter)`）。同じ prefix に router が 2 つ載ってよい。path は `/{id}/<子>`                                                                                                                                                                                                                    |
| 失敗の使い分け                         | 見えないものは `NOT_FOUND`（在ることも知らせない）、見えるが権限が足りないものは `FORBIDDEN`。確認の順は NOT_FOUND → FORBIDDEN                                                                                                                                                                                                                       |
| 状態コード                             | 作成は 200 で作ったものを返す。削除は `{ ok: true }` の 200                                                                                                                                                                                                                                                                                          |
| 入力の文字列                           | `trim()` してから長さを数える。空白だけは通さない                                                                                                                                                                                                                                                                                                    |
| 一覧                                   | 必ず `pageQuery` / `pageResponseSchema` / `pageResponse` を使う。repo は `PageQuery` を受け取って `Page` を返す（`toPage`）。上限の無い一覧を書かない。応答は `{ items, nextCursor }`（nextCursor は文字列。続きが無ければ null）。並びが昇順なら、cursor の比較は `gt`（invoices の降順は `lt`）。親が見えないときの一覧は `NOT_FOUND` を返してよい |
| 閲覧者の型                             | 利用者のいない入口（cron、webhook）が呼ぶ service は `Viewer` を受ける。利用者の操作だけの service は `User` を受けてよい（HTTP は `requireAuth` で `User` になる）。他 module への問い合わせを `User` で宣言しても、相手が `Viewer` を受けていれば満たせる                                                                                          |
| 外部キーの onDelete                    | 親が消えたら子も消えるなら `cascade`。子が親より長く残るべきなら、理由を書いて別の値にする                                                                                                                                                                                                                                                           |
| システム（cron、webhook）の権限        | 書く・消すのは利用者（`User`）だけ。システムにさせたい操作は、持ち主の `commands/` に出す（例: `markPaid`）                                                                                                                                                                                                                                          |
| テスト                                 | `test/` に平置き。本物のローカル D1 を使う。HTTP は `fixtures.ts` の `request(user, method, path, body)` で、利用者を差し替えて試す                                                                                                                                                                                                                  |
| migration                              | `pnpm db:generate` で作る。`pnpm format` は `migrations/meta/*.json` を壊すので、migrations には掛けない                                                                                                                                                                                                                                             |

## 未決

- 共有の相手が同じ組織かは確かめていない（利用者の一覧が無い）。違う組織でも、範囲が組織で絞るので見えないだけ
- 共有の取り消しと書き込みの間の競合: access を見てから書くまでの間に取り消されると、1 回は書ける（書き込みは組織の範囲に留まる）。
  SQL に access の判定を持たせるとルールが 2 か所になるので、domain の 1 か所を取った
- 閲覧だけを共有された人も、支払いを始められる（`getPayable` は access を見ない）
- D1 には対話的なトランザクションが無い（`batch` が基本）。マルチテナントを考えるときに効く
- テストの方針（service は偽物の repo、HTTP は vitest-pool-workers のローカル D1、偽物は外の API だけ、が候補）
- ID のブランド型
- 「育ち方」を lint と生成器にどこまで載せるか
- queue を複数持つときの振り分け、cron 式ごとの切り替え（今は 1 つずつ）
- conventions.md の hnk 側の列（どの層で縛るか）が空
- この形で実プロダクトを書いてから、hnk 本体（生成器・スキル）に持ち帰る
