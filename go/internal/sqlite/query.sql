-- name: ListInvoicesByOwner :many
SELECT * FROM invoices
WHERE owner_id = ?
ORDER BY updated_at DESC;

-- name: GetInvoice :one
SELECT * FROM invoices
WHERE id = ?
LIMIT 1;

-- name: InsertInvoice :exec
INSERT INTO invoices (id, owner_id, title, body, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?);

-- name: UpdateInvoice :exec
UPDATE invoices
SET title = ?, body = ?, updated_at = ?
WHERE id = ?;

-- name: DeleteInvoice :exec
DELETE FROM invoices
WHERE id = ?;
