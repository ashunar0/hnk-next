package sqlite

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"example.com/invoices/internal/invoice"
	"example.com/invoices/internal/sqlite/db"
	"example.com/invoices/internal/user"
)

// InvoiceStore は invoice.Store を満たす。
type InvoiceStore struct {
	q *db.Queries
}

// 満たしていなければ、ここでコンパイルが止まる。
var _ invoice.Store = (*InvoiceStore)(nil)

func NewInvoiceStore(conn db.DBTX) *InvoiceStore {
	return &InvoiceStore{q: db.New(conn)}
}

func (s *InvoiceStore) ListByOwner(ctx context.Context, owner user.ID) ([]invoice.Invoice, error) {
	rows, err := s.q.ListInvoicesByOwner(ctx, string(owner))
	if err != nil {
		return nil, err
	}

	invs := make([]invoice.Invoice, 0, len(rows))
	for _, row := range rows {
		invs = append(invs, invoiceFromRow(row))
	}

	return invs, nil
}

func (s *InvoiceStore) Get(ctx context.Context, id invoice.ID) (invoice.Invoice, error) {
	row, err := s.q.GetInvoice(ctx, string(id))
	if errors.Is(err, sql.ErrNoRows) {
		return invoice.Invoice{}, invoice.ErrNotFound
	}
	if err != nil {
		return invoice.Invoice{}, err
	}

	return invoiceFromRow(row), nil
}

func (s *InvoiceStore) Insert(ctx context.Context, inv invoice.Invoice) error {
	return s.q.InsertInvoice(ctx, db.InsertInvoiceParams{
		ID:        string(inv.ID),
		OwnerID:   string(inv.OwnerID),
		Title:     inv.Title,
		Body:      inv.Body,
		CreatedAt: inv.CreatedAt.UnixMilli(),
		UpdatedAt: inv.UpdatedAt.UnixMilli(),
	})
}

func (s *InvoiceStore) Update(ctx context.Context, inv invoice.Invoice) error {
	return s.q.UpdateInvoice(ctx, db.UpdateInvoiceParams{
		ID:        string(inv.ID),
		Title:     inv.Title,
		Body:      inv.Body,
		UpdatedAt: inv.UpdatedAt.UnixMilli(),
	})
}

func (s *InvoiceStore) Delete(ctx context.Context, id invoice.ID) error {
	return s.q.DeleteInvoice(ctx, string(id))
}

// invoiceFromRow は保存されている 1 行を、請求書に戻す。
func invoiceFromRow(row db.Invoice) invoice.Invoice {
	return invoice.Invoice{
		ID:        invoice.ID(row.ID),
		OwnerID:   user.ID(row.OwnerID),
		Title:     row.Title,
		Body:      row.Body,
		CreatedAt: time.UnixMilli(row.CreatedAt),
		UpdatedAt: time.UnixMilli(row.UpdatedAt),
	}
}
