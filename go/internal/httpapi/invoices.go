package httpapi

import (
	"net/http"

	"example.com/invoices/internal/invoice"
	"example.com/invoices/internal/user"
)

// 応答の形。json タグがそのまま契約になる。
type invoiceResponse struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Body      string `json:"body"`
	CreatedAt int64  `json:"createdAt"`
	UpdatedAt int64  `json:"updatedAt"`
}

type listInvoicesResponse struct {
	Items []invoiceResponse `json:"items"`
}

func newInvoiceResponse(inv invoice.Invoice) invoiceResponse {
	return invoiceResponse{
		ID:        string(inv.ID),
		Title:     inv.Title,
		Body:      inv.Body,
		CreatedAt: inv.CreatedAt.UnixMilli(),
		UpdatedAt: inv.UpdatedAt.UnixMilli(),
	}
}

// 受け取る形。
type invoiceRequest struct {
	Title string `json:"title"`
	Body  string `json:"body"`
}

func (req invoiceRequest) input() invoice.Input {
	return invoice.Input{Title: req.Title, Body: req.Body}
}

// 一覧
func handleListInvoices(invoices *invoice.Service) authedHandler {
	return func(w http.ResponseWriter, r *http.Request, viewer user.ID) {
		invs, err := invoices.ListMine(r.Context(), viewer)
		if err != nil {
			writeError(w, r, err)
			return
		}

		items := make([]invoiceResponse, 0, len(invs))
		for _, inv := range invs {
			items = append(items, newInvoiceResponse(inv))
		}
		encode(w, http.StatusOK, listInvoicesResponse{Items: items})
	}
}

// 1件
func handleGetInvoice(invoices *invoice.Service) authedHandler {
	return func(w http.ResponseWriter, r *http.Request, viewer user.ID) {
		id := invoice.ID(r.PathValue("id"))

		inv, err := invoices.Get(r.Context(), viewer, id)
		if err != nil {
			writeError(w, r, err)
			return
		}

		encode(w, http.StatusOK, newInvoiceResponse(inv))
	}
}

// 作成
func handleCreateInvoice(invoices *invoice.Service) authedHandler {
	return func(w http.ResponseWriter, r *http.Request, viewer user.ID) {
		req, err := decode[invoiceRequest](r)
		if err != nil {
			writeErrorBody(w, http.StatusBadRequest, "VALIDATION_ERROR", "入力内容を確認してください")
			return
		}

		inv, err := invoices.Create(r.Context(), viewer, req.input())
		if err != nil {
			writeError(w, r, err)
			return
		}

		encode(w, http.StatusOK, newInvoiceResponse(inv))
	}
}

// 更新
func handleUpdateInvoice(invoices *invoice.Service) authedHandler {
	return func(w http.ResponseWriter, r *http.Request, viewer user.ID) {
		id := invoice.ID(r.PathValue("id"))
		req, err := decode[invoiceRequest](r)
		if err != nil {
			writeErrorBody(w, http.StatusBadRequest, "VALIDATION_ERROR", "入力内容を確認してください")
			return
		}

		inv, err := invoices.Update(r.Context(), viewer, id, req.input())
		if err != nil {
			writeError(w, r, err)
			return
		}

		encode(w, http.StatusOK, newInvoiceResponse(inv))
	}
}

// 削除
func handleDeleteInvoice(invoices *invoice.Service) authedHandler {
	return func(w http.ResponseWriter, r *http.Request, viewer user.ID) {
		id := invoice.ID(r.PathValue("id"))

		if err := invoices.Delete(r.Context(), viewer, id); err != nil {
			writeError(w, r, err)
			return
		}

		encode(w, http.StatusOK, map[string]bool{"ok": true})
	}
}
