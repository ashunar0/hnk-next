package invoice

import (
	"context"
	"crypto/rand"
	"fmt"
	"time"

	"example.com/invoices/internal/user"
)

// Store は Service が必要とする保存の形。使う側のここで宣言し、
// internal/sqlite がそれを満たす。このパッケージは sqlite を import しない。
type Store interface {
	ListByOwner(ctx context.Context, owner user.ID) ([]Invoice, error)
	// Get は、無ければ ErrNotFound を返す。
	Get(ctx context.Context, id ID) (Invoice, error)
	Insert(ctx context.Context, inv Invoice) error
	Update(ctx context.Context, inv Invoice) error
	Delete(ctx context.Context, id ID) error
}

type Service struct {
	store Store
	now   func() time.Time
	newID func() ID
}

func NewService(store Store) *Service {
	return &Service{
		store: store,
		now:   time.Now,
		newID: func() ID { return ID(rand.Text()) },
	}
}

// ListMine は自分の請求書を、更新の新しい順に返す。
func (s *Service) ListMine(ctx context.Context, viewer user.ID) ([]Invoice, error) {
	return s.store.ListByOwner(ctx, viewer)
}

// Get は 1 件返す。他人のものは、在ることも知らせない。
func (s *Service) Get(ctx context.Context, viewer user.ID, id ID) (Invoice, error) {
	inv, err := s.store.Get(ctx, id)
	if err != nil {
		return Invoice{}, err
	}
	if inv.OwnerID != viewer {
		return Invoice{}, ErrNotFound
	}

	return inv, nil
}

func (s *Service) Create(ctx context.Context, owner user.ID, in Input) (Invoice, error) {
	in, err := in.Validate()
	if err != nil {
		return Invoice{}, err
	}

	now := s.now()
	inv := Invoice{
		ID:        s.newID(),
		OwnerID:   owner,
		Title:     in.Title,
		Body:      in.Body,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := s.store.Insert(ctx, inv); err != nil {
		return Invoice{}, fmt.Errorf("insert invoice: %w", err)
	}

	return inv, nil
}

// Update は書き換える。書き換えられるのは所有者だけ。
func (s *Service) Update(ctx context.Context, viewer user.ID, id ID, in Input) (Invoice, error) {
	in, err := in.Validate()
	if err != nil {
		return Invoice{}, err
	}

	inv, err := s.store.Get(ctx, id)
	if err != nil {
		return Invoice{}, err
	}
	if inv.OwnerID != viewer {
		return Invoice{}, ErrNotOwner
	}

	inv.Title = in.Title
	inv.Body = in.Body
	inv.UpdatedAt = s.now()
	if err := s.store.Update(ctx, inv); err != nil {
		return Invoice{}, fmt.Errorf("update invoice %s: %w", id, err)
	}

	return inv, nil
}

// Delete は消す。消せるのは所有者だけ。
func (s *Service) Delete(ctx context.Context, viewer user.ID, id ID) error {
	inv, err := s.store.Get(ctx, id)
	if err != nil {
		return err
	}
	if inv.OwnerID != viewer {
		return ErrNotOwner
	}

	if err := s.store.Delete(ctx, id); err != nil {
		return fmt.Errorf("delete invoice %s: %w", id, err)
	}

	return nil
}
