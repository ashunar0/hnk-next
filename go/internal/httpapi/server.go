// Package httpapi は HTTP の入出力だけを受け持つ。
// 手順は invoice などのパッケージにあり、ここは呼んで、結果を JSON にする。
package httpapi

import (
	"net/http"

	"example.com/invoices/internal/invoice"
)

func NewServer(invoices *invoice.Service) http.Handler {
	mux := http.NewServeMux()
	addRoutes(mux, invoices)

	var h http.Handler = mux
	h = withViewer(h)

	return h
}
