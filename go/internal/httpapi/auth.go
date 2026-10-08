package httpapi

import (
	"context"
	"net/http"

	"example.com/invoices/internal/user"
)

type viewerKey struct{}

// withViewer は閲覧者を context に積む。未ログインでも通す。
//
// TODO: セッションを解いて積む。認証の提供元がまだ無いあいだは常に未ログイン
func withViewer(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		next.ServeHTTP(w, r)
	})
}

func viewerFrom(ctx context.Context) (user.ID, bool) {
	id, ok := ctx.Value(viewerKey{}).(user.ID)
	return id, ok
}

// authedHandler はログイン済みの閲覧者を引数で受け取る handler。
type authedHandler func(w http.ResponseWriter, r *http.Request, viewer user.ID)

// requireAuth はログインを要求する。通れば viewer を引数で渡す。
func requireAuth(h authedHandler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		viewer, ok := viewerFrom(r.Context())
		if !ok {
			writeErrorBody(w, http.StatusUnauthorized, "UNAUTHORIZED", "ログインが必要です")
			return
		}
		h(w, r, viewer)
	})
}
