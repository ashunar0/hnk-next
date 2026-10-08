package httpapi

import (
	"net/http"

	"example.com/invoices/internal/invoice"
)

// addRoutes は、この API の全ルートを並べる唯一の場所。
func addRoutes(mux *http.ServeMux, invoices *invoice.Service) {
	mux.Handle("GET /invoices", requireAuth(handleListInvoices(invoices)))
	mux.Handle("GET /invoices/{id}", requireAuth(handleGetInvoice(invoices)))
	mux.Handle("POST /invoices", requireAuth(handleCreateInvoice(invoices)))
	mux.Handle("PUT /invoices/{id}", requireAuth(handleUpdateInvoice(invoices)))
	mux.Handle("DELETE /invoices/{id}", requireAuth(handleDeleteInvoice(invoices)))
}
