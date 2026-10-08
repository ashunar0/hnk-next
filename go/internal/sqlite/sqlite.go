// Package sqlite は、各パッケージが宣言した Store を SQLite で満たす。
package sqlite

import (
	"context"
	"database/sql"
	_ "embed"

	_ "modernc.org/sqlite" // ドライバを名指しする、このプロジェクトで唯一の場所
)

//go:embed schema.sql
var schema string

// Open は DB を開き、表が無ければ作る。
func Open(ctx context.Context, path string) (*sql.DB, error) {
	conn, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	if _, err := conn.ExecContext(ctx, schema); err != nil {
		conn.Close()
		return nil, err
	}

	return conn, nil
}
