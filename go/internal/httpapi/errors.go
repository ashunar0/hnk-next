package httpapi

import (
	"errors"
	"log/slog"
	"net/http"

	"example.com/invoices/internal/invoice"
)

type errorResponse struct {
	Error errorDetail `json:"error"`
}

type errorDetail struct {
	Code    string `json:"code"`
	Message string `json:"message"`
}

func writeErrorBody(w http.ResponseWriter, status int, code, message string) {
	encode(w, status, errorResponse{Error: errorDetail{Code: code, Message: message}})
}

// writeError は、ドメインのエラーを何番で返すかを決める唯一の場所。
func writeError(w http.ResponseWriter, r *http.Request, err error) {
	var verr *invoice.ValidationError

	switch {
	case errors.As(err, &verr):
		writeErrorBody(w, http.StatusBadRequest, "VALIDATION_ERROR", verr.Message)
	case errors.Is(err, invoice.ErrNotFound):
		writeErrorBody(w, http.StatusNotFound, "NOT_FOUND", "対象が見つかりません")
	case errors.Is(err, invoice.ErrNotOwner):
		writeErrorBody(w, http.StatusForbidden, "FORBIDDEN", "この操作は許可されていません")
	default:
		slog.ErrorContext(r.Context(), "unhandled", "err", err)
		writeErrorBody(w, http.StatusInternalServerError, "INTERNAL", "Internal Server Error")
	}
}
