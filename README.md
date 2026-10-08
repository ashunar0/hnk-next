# go-vs-hnk

同じ API（invoices の一覧・1件・作成・更新・削除）を、Go の定番の書き方と hnk で書いて並べたもの。

- `go/`: 標準の `net/http` と sqlc。`go build ./cmd/api` で動く
- `hono/`: `hnk/fixture`（experiment/deps-composition-root ブランチ）のコピー。invoices だけに絞り、`api/index.ts` に route を mount した

## ファイルの対応

| 役割 | go/ | hono/ |
|---|---|---|
| 起動と組み立て | `cmd/api/main.go` | `api/index.ts` + `api/deps.ts` |
| ルートの一覧 | `internal/httpapi/routes.go` | `api/features/invoices/route.ts`（チェーン） |
| handler | `internal/httpapi/invoices.go` | `api/features/invoices/route.ts` |
| 応答の形 | `internal/httpapi/invoices.go`（json タグ） | `contract/invoices/schema.ts` + `presenter.ts` |
| 入力の検査 | `internal/invoice/invoice.go`（`Validate`） | `contract/invoices/schema.ts`（zod）+ `api/lib/validator.ts` |
| モノ（What） | `internal/invoice/invoice.go` | `api/features/invoices/table.ts`（+ contract の型） |
| 手順 | `internal/invoice/service.go` | `api/features/invoices/service.ts` |
| 保存の形（interface） | `internal/invoice/service.go`（`Store`、使う側で宣言） | `api/features/invoices/repository.ts`（作る側で宣言） |
| 保存の実装 | `internal/sqlite/invoice_store.go` | `api/features/invoices/repository.ts` |
| テーブル | `internal/sqlite/schema.sql` | `api/features/invoices/table.ts` |
| クエリ | `internal/sqlite/query.sql` → `db/`（sqlc が生成） | repository の中に drizzle で直接 |
| エラーとステータスの対応 | `internal/httpapi/errors.go`（`writeError`） | `api/lib/errors.ts`（`onError`） |
| 認証 | `internal/httpapi/auth.go` | `api/middleware/auth.ts` |
| ID の型 | `invoice.ID` / `user.ID` | `string` |
