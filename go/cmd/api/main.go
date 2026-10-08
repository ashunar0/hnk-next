package main

import (
	"cmp"
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"os/signal"

	"example.com/invoices/internal/httpapi"
	"example.com/invoices/internal/invoice"
	"example.com/invoices/internal/sqlite"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
	defer stop()

	if err := run(ctx, os.Getenv); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(ctx context.Context, getenv func(string) string) error {
	conn, err := sqlite.Open(ctx, cmp.Or(getenv("DATABASE_PATH"), "invoices.db"))
	if err != nil {
		return fmt.Errorf("open db: %w", err)
	}
	defer conn.Close()

	// 組み立て。上から順に、手で書く
	invoices := invoice.NewService(sqlite.NewInvoiceStore(conn))

	srv := &http.Server{
		Addr:    ":" + cmp.Or(getenv("PORT"), "8080"),
		Handler: httpapi.NewServer(invoices),
	}

	go func() {
		<-ctx.Done()
		srv.Shutdown(context.Background())
	}()

	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		return err
	}

	return nil
}
