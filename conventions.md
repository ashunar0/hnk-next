# Go サンプルの慣習の洗い出し

`go/` のコードから、書き方の慣習を取り出したもの。
「守っているもの」は、Go でそれを守らせているのが何か。

- 言語: コンパイラが止める
- 道具: gofmt / go vet / sqlc など標準や定番のツールが止める・固定する
- 文化: 文書とレビューだけ。破っても何も起きない

次の段階で、各項目に「hnk ではどの層で縛るか（A 生成 / B 依存の lint / C 書き方の lint / D 共通部品 / E 文書）」「今あるか」「無いなら何を作るか」を足す。

## 組み立てと依存

| # | 慣習 | Go での場所 | 守っているもの |
|---|---|---|---|
| 1 | 組み立ては main で手で書く。DI コンテナを使わない | `cmd/api/main.go` | 文化 |
| 2 | 依存はコンストラクタの引数で渡す（`NewService(store)`） | `invoice/service.go` | 文化 |
| 3 | グローバルな可変状態を持たない | — | 文化 |
| 4 | 時刻や ID の生成も依存として持つ（`now`、`newID`） | `invoice/service.go` | 文化 |
| 5 | DB ドライバを名指しするのは 1 か所 | `sqlite/sqlite.go` | 文化 |

## パッケージと境界

| # | 慣習 | Go での場所 | 守っているもの |
|---|---|---|---|
| 6 | アプリの中身は `internal/` に置き、外から使わせない | `internal/` | 言語 |
| 7 | 公開範囲は名前の大文字・小文字で決まる | 全体 | 言語 |
| 8 | ドメイン（`invoice`）は HTTP も SQL も import しない | `invoice/` | 文化 |
| 9 | import は循環しない | 全体 | 言語 |
| 10 | 依存の向きは外側（httpapi、sqlite）→ ドメインの一方通行 | 全体 | 文化 |
| 11 | 層の名前（models/、controllers/）で切らない | 全体 | 文化 |

## モノ（What）

| # | 慣習 | Go での場所 | 守っているもの |
|---|---|---|---|
| 12 | モノは構造体 1 つに集める（`Invoice`） | `invoice/invoice.go` | 文化 |
| 13 | ID は名前付き型にして取り違えを防ぐ（`invoice.ID`、`user.ID`） | `invoice/invoice.go`、`user/user.go` | 言語（使うかは文化） |
| 14 | 入力の検査はモノの側に置く（`Input.Validate`） | `invoice/invoice.go` | 文化 |
| 15 | 上限値などの定数はモノのパッケージに置く | `invoice/invoice.go` | 文化 |

## interface

| # | 慣習 | Go での場所 | 守っているもの |
|---|---|---|---|
| 16 | interface は使う側で宣言する（`Store`） | `invoice/service.go` | 文化 |
| 17 | interface は小さく、使う操作だけにする | `invoice/service.go` | 文化 |
| 18 | 満たしていることをコンパイル時に確かめる（`var _ invoice.Store = ...`） | `sqlite/invoice_store.go` | 文化 |

## エラー

| # | 慣習 | Go での場所 | 守っているもの |
|---|---|---|---|
| 19 | エラーは戻り値で返す | 全体 | 言語 |
| 20 | エラーを無視しない | 全体 | 道具（errcheck） |
| 21 | ドメインのエラーはドメインの言葉で表し、HTTP を知らない（`ErrNotFound`、`ErrNotOwner`） | `invoice/invoice.go` | 文化 |
| 22 | 名前は `Err...`（値）と `...Error`（型） | `invoice/invoice.go` | 文化 |
| 23 | 包むときは `%w` で文脈を足す | `invoice/service.go` | 文化 |
| 24 | 保存側の「無い」（`sql.ErrNoRows`）はドメインのエラーに言い換える | `sqlite/invoice_store.go` | 文化 |
| 25 | エラーは 1 回だけ処理する（ログに出すか、返すか） | 全体 | 文化 |
| 26 | エラー → ステータスの対応は 1 か所に集める | `httpapi/errors.go` | 文化 |
| 27 | 想定外のエラーは 500 にしてログに残す | `httpapi/errors.go` | 文化 |

## HTTP

| # | 慣習 | Go での場所 | 守っているもの |
|---|---|---|---|
| 28 | ルートは 1 か所に並べる | `httpapi/routes.go` | 文化 |
| 29 | handler は「受け取る → 呼ぶ → 返す」だけ | `httpapi/invoices.go` | 文化 |
| 30 | handler は依存を引数で受け取る関数が作る（`handleX(svc)`） | `httpapi/invoices.go` | 文化 |
| 31 | 応答は専用の型に詰め替える。ドメインの型をそのまま JSON にしない | `httpapi/invoices.go` | 文化 |
| 32 | JSON のキーはタグで明示する | `httpapi/invoices.go` | 文化 |
| 33 | ログイン済みの閲覧者は引数で渡す（`authedHandler`） | `httpapi/auth.go` | 文化 |
| 34 | JSON の読み書きは共通のヘルパーを通す | `httpapi/encode.go` | 文化 |

## データ

| # | 慣習 | Go での場所 | 守っているもの |
|---|---|---|---|
| 35 | SQL を先に書き、コードを生成する | `sqlite/query.sql` → `sqlite/db/` | 道具（sqlc） |
| 36 | 生成物は手で直さない | `sqlite/db/`（DO NOT EDIT） | 道具 |
| 37 | 保存の行の型とドメインの型を分け、変換する（`invoiceFromRow`） | `sqlite/invoice_store.go` | 文化 |
| 38 | 時刻は `time.Time` で持ち、保存するときに数値へ変換する | `sqlite/invoice_store.go` | 文化 |

## 文脈と起動

| # | 慣習 | Go での場所 | 守っているもの |
|---|---|---|---|
| 39 | `ctx` を第 1 引数で流す | 全体 | 文化 |
| 40 | `main` は `run` を呼ぶだけで、終了は 1 か所 | `cmd/api/main.go` | 文化 |
| 41 | 設定は環境変数から `run` に引数で渡す | `cmd/api/main.go` | 文化 |

## 書式

| # | 慣習 | Go での場所 | 守っているもの |
|---|---|---|---|
| 42 | 書式は 1 つ | 全体 | 道具（gofmt） |
| 43 | 怪しい書き方を検出する | 全体 | 道具（go vet） |
