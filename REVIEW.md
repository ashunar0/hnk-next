# 設計レビューのための入口

hnk-next は、Hono の上で「誰が書いても（AI が書いても）同じ形になる」ための仕組みと規約を、パッケージとして作る実験場です。
このページは、設計・アーキテクチャ・思想を見てもらうための入口です。実装の細部ではなく、**判断が妥当かどうか**を見てほしいと考えています。

## 先に伝えておくこと

- **実プロダクトでは、まだ使っていません**。検証は全部この実験場の中（請求書アプリと、そこに足した場面）で行っています。「実際に使って困ったこと」はまだ材料になっていません
- 設計の途中経過を残しているため、`docs/` の過去分は**当時の状態の記録**で、今のコードと違う記述があります。今の設計は、この REVIEW.md と README.md、`main` のコードを見てください
- 外部のレビューを何度か受けています（`docs/01〜13`）。GitHub 上のコードだけを読んだレビューは、古い版を見ていることがありました。**`main` の最新を見てもらえると助かります**
- AI を使った実験は、Sonnet で 1 回ずつです。「書かせる」実験が 4 回（`docs/09.md`）、「壊れたコードを直させる」実験が 1 回（`docs/13.md`）。傾向とは言えません

## 狙い

AI エージェントに書かせたとき、

1. どんなアプリでも同じ形になる
2. ミスしにくい。ミスしても、AI 自身が気づいて直せる

のために、形を決める部品を用意し、守ってほしいことはできるだけ型と lint に寄せます。縛りの強さは「型 ＞ module の境界 ＞ lint ＞ 散文」の順です。
AI が自分で直せるかはエラーの質で決まるので、赤線の出る位置や lint のメッセージも設計の対象にしています。

目指す先は Go です（省略しない、隠さない、誰が書いても同じ）。同じ API を Go の定番の書き方でも書いて比べました（`go/`、`conventions.md`）。
置き場所は Rails のように決め、中身は Go のように明示的に書く、という位置づけです。

原則は 4 つです。**ブラックボックスにしない／最小限／読んだときに分かる／こね回さない**（Hono が自然に書ける形の中で綺麗にする）。
経緯は [docs/vision.md](docs/vision.md) にあります（一部は古い。冒頭に注記）。

## 設計の柱

それぞれ「決めたこと」「理由」「却下した案」の順です。

### 1. 置き場所: core / inbound / outbound、育つのは「2 つ目が現れたとき」だけ

- module は `domain / service / routes / repo.d1` の 4 ファイルで始める。矢印は全部 core（domain・service）に向かう
- 育つのは、2 つ目の入口（cron、キュー、webhook）、2 つ目の出口（外部 API、メール）、1 つのファイルが 2 つ目の理由で変わり始めたとき、他の module が書きに来たとき。それまでは足さない
- **理由**: 最初から層を揃えると、小さいアプリに要素が多すぎて、理解されない。毎回あるものは最初から置き、規模で出てくるものはきっかけが起きてから足す
- **却下**: 最初からクリーンアーキテクチャを適用する案。`features/` で区切る案（features は機能＝複数のモノにまたがる操作の言葉なので、`modules` にした）
- 見る場所: README「出発点と育ち方」、`hono/api/modules/invoices/`

### 2. 守らせ方: 型と lint で、機械で止められるものは止める

- 依存の向きは、役割ごとの許可表（`packages/hnk/lint/layers.mjs`）で守らせる。表に無い import は全部だめ。README の表はこのファイルから自動生成し、ずれたら `pnpm check` が落ちる
- lint は 6 ルール（`packages/hnk/lint/rules/`）。テストは、わざと違反を書いたファイルで、メッセージの文言まで固定している
- `pnpm check` は、型・lint・テスト・許可表のずれを、途中で落ちても止めずに回し、失敗を一覧で出す（AI が一度に直せる量を見えるようにするため）
- **基準**: 「それが無いと、どんな間違いが書けてしまうか」を言えるものだけ作る。見た目を変えるだけのものは作らない
- 機械で止められない線（例: 読みの集計を持ち主に置くか読み側に置くか）は、レビューに残している

### 3. 失敗: 想定内は Result、throw は入口と想定外だけ

- service は HTTP を知らない。失敗は `Result` で返し、番号と文言は `httpError("NOT_FOUND", 404, "…")` が持つ
- route は `createEndpoint` に `responses` を宣言する（`@hono/zod-openapi` の上）。handler は `reply(200, body)` / `reply.failure(error)` で返し、宣言とずれた応答は型エラーになる。guard（`requireAuth` など）が持つ失敗は `responses` に自動で足される
- **理由**: 失敗が戻り値の型に出て、どの失敗がありうるかを列挙できる。処理を飛ばすと型エラーになる
- **却下**: service が `forbidden()` / `notFound()` を throw する案（HTTP の番号を知ってしまい、cron から呼ぶと意味が通らない）。defineHandler の完成を待つ案（Hono 本体の PR #5531 は未マージで、`response` が 1 つだけなので、番号ごとの失敗の宣言が載らない）
- 見る場所: `packages/hnk/src/index.ts`、`invoices/routes.ts`、`invoices/service.ts`

### 4. 提供の仕方: 仕組みはパッケージ、アプリの決めごとは生成

- 仕組み（Result、`createRouter`、`createEndpoint`、`createWorker`、lint）は `hnk` パッケージ。エラーの表、env、deps、middleware と module はアプリ側
- **却下**: shadcn 方式で lib をコピーする案（Hono の上に載る FW なら、ヘルパーはパッケージで提供するべきだという判断）。結びつけのためだけのファイルを作る案

### 5. 印: 検査済みの値と ID は、型で区別する

- 入力は zod の brand で検査済みの印を付け、service は印付きの値しか受け取らない。cron などから生の値を渡すと型エラー
- `InvoiceId` / `UserId` / `OrgId` は `string & { [brand]: true }`。印を付けられるのは、その module の domain の作る関数だけで、`as XxxId` は lint（`no-id-cast`）が止める
- 利用者とシステム（cron や webhook）の Viewer にも、`unique symbol` の印を付け、リテラルで偽造できない
- module をまたぐ所は、使う側が ID を素の `string` で宣言し、`deps.ts`（つなぐ場所）で印を付けて渡す。宣言を関数の型で書くので、印を要求する関数をそのまま渡すと型エラーになる
- 見る場所: `modules/*/domain.ts`、`api/deps.ts`、`*.typetest.ts`

### 6. 依存: 使う側が形を宣言し、`deps.ts` でつなぐ

- service が必要な outbound や他 module の形を、自分で宣言する（Go の「interface は使う側が決める」）。repo や相手の service がそれを満たす。module は他の module を import しない
- 組み立ては `buildApp(makeDeps)`。組み立てた結果ではなく、組み立て方を渡す（Workers はリクエストをまたいだ I/O を拒むので）。handler は `(c, reply, { invoices })` で受け取る
- 他の module に書き込ませたいときは、書かれる側の `commands/<操作>.ts` を通す。1 回の書き込みで変えるのは 1 つの module だけにし、まとめて取り消す仕組みが無いので、どの書き込みも何度やっても同じ結果にする。module をまたぐ書き込みは、再送のある入口（webhook・queue・cron）からだけ呼び、routes（再送が無い）から変えてよい module は 1 つだけ
- **却下**: import で直接つなぐ案（D1 では動くが、接続を持つ Postgres ではモジュールスコープの共有が壊れる）。DI コンテナ（登録漏れが実行時エラーになる）

### 7. テナントの線: 範囲（Reach）が必須

- 閲覧者から `Reach`（システムは全部、admin は自分の組織、member は自分のものと共有されたもの）を作り、repo が解釈して行と一緒に access を返す
- 他の module に見せる読みは、範囲が必須の `〜Within(db, reach)` だけ。他の module の表を直接読むのは lint（`no-foreign-table-reads`）が止める。契約テストが、export された `〜Within` 全部に「他の組織のデータが出ない」を当てる
- **基準**: 「無いと書けてしまう間違い」は何か。他の表への書きは `scopeTo` で既に不可。残るのは範囲の付け忘れだけなので、そこを型と lint で埋める

## 読む順番

1. [README.md](README.md): 全体の形、決めたこと、未決
2. `hono/api/modules/invoices/` の `domain.ts` → `service.ts` → `routes.ts` → `repo.d1.ts`: 1 つの module の全体
3. `hono/api/deps.ts`: 組み立てと、module をまたぐ所
4. `packages/hnk/src/index.ts`: 仕組みの中身（`createEndpoint`、`reply`、`httpError`、`createWorker`）
5. `packages/hnk/lint/layers.mjs`: 許可表
6. [docs/03.md](docs/03.md): 場面ごとに形を試した記録（認証、cron、キュー、webhook、集計）
7. [docs/09.md](docs/09.md): AI に新しい module を書かせた実験（4 回）
   [docs/13.md](docs/13.md): AI に違反を仕込んだコードを直させた実験（lint の文言のどこが足りなかったか）
8. [docs/vision.md](docs/vision.md): 思想の言語化（一部古い）

## 見てほしい問い

判断の妥当性を、次のような観点で見てもらえるとありがたいです。全部に答える必要はありません。

1. **育ち方の基準**: 「2 つ目が現れたときだけ育てる」の判断は、事実で決められているか。足す条件が曖昧で、結局人の感覚に戻っていないか。core / inbound / outbound という呼び方は適切か
2. **失敗の扱い**: Result と `httpError` と `responses` の宣言で、ドメインの失敗と HTTP の失敗を二重に管理していないか。guard が失敗を自動で足す挙動は、「ブラックボックスにしない」と相性が悪くないか
3. **zod-openapi 前提**: `createEndpoint` は `@hono/zod-openapi` の `createRoute` の形に乗っている。zod への依存は許容できるか。将来 `defineHandler`（Standard Schema）に寄せる余地を、どう見るか
4. **module をまたぐ**: 使う側が形を宣言して `deps.ts` でつなぐ、書き込みは `commands/` を通す、という組み立て。1 回の書き込みで 1 つの module だけを変える方針は、どんな場面で破綻するか
5. **印の入れ方**: brand と `unique symbol` の使い方は過剰か。ID の印を `deps.ts` で付ける形は、読む人に分かるか
6. **テナントと共有**: `Reach` と、repo が access を返す形に、穴は無いか。共有の取り消しと書き込みの競合を、domain の 1 か所で取った判断（README の未決）は妥当か
7. **domain の粒度**: domain は関数と型で、class にしていない（[docs/10.md](docs/10.md)）。この粒度で、「偽造されて困る権限」を持つモノが出てきたときに耐えられるか
8. **lint の量と置き場所**: 6 ルールは多いか少ないか。ルールの文言を AI への指示として固定する方針は、妥当か
9. **検証の仕方**: 「AI が書いても同じ形になる」は書かせる実験 4 回、「ミスしても AI が直せる」は直させる実験 1 回（12 個の違反。ただし 4 個は使われていないコードで、消すだけで直った）。どちらも n=1 ずつ。この確かめ方で足りるか。ほかに測れることはあるか
10. **引き算**: 全体を見て、**削れるものは何か**。YAGNI と引き算を設計の基準にしているので、増えすぎている所の指摘を特に歓迎します

## 既知の未決・穴

README の「未決」に載せています。外部レビューを受けた後の判断待ち（lint 2 本を削るか、module をまたぐ書き込みを再送のある入口に限るか、`Reach` の置き場所）は `docs/12.md` にあります。主なものは次のとおりです。

- 実プロダクトで使っていない
- D1 に対話的なトランザクションが無い（`batch` が基本）
- 共有の相手が同じ組織かを確かめていない。取り消しと書き込みの競合。閲覧だけの人が支払いを始められる
- 共有の相手の利用者 ID は、routes が他の module の作る関数を使えないので、素の `string` のまま
- 使わない一覧を止める lint は無い（部品が見える所にあれば使われた、という実験結果で保留）
- 「育ち方」を lint と生成器にどこまで載せるか
- 本体（生成器・スキル・fixture）への反映は、まだ

## 文書の索引

`docs/README.md` に、各文書が何かを 1 行ずつ書いています。
