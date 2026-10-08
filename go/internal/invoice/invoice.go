// Package invoice は請求書というモノと、それを扱う手順をまとめる。
// HTTP も SQL も知らない。
package invoice

import (
	"errors"
	"fmt"
	"strings"
	"time"
	"unicode/utf8"

	"example.com/invoices/internal/user"
)

// ID は請求書の ID。user.ID や ただの string とは混ぜられない。
type ID string

// Invoice は請求書 1 件。
type Invoice struct {
	ID        ID
	OwnerID   user.ID
	Title     string
	Body      string
	CreatedAt time.Time
	UpdatedAt time.Time
}

// 失敗はこのパッケージの言葉で表す。何番で返すかは HTTP 側が決める。
var (
	ErrNotFound = errors.New("invoice not found")
	ErrNotOwner = errors.New("not the owner of the invoice")
)

const (
	TitleMax = 100
	BodyMax  = 20000
)

// Input は作成と更新で受け取る値。
type Input struct {
	Title string
	Body  string
}

// ValidationError は入力が規則に合わないことを表す。
type ValidationError struct {
	Message string
}

func (e *ValidationError) Error() string { return e.Message }

// Validate は入力を検査し、整えた Input を返す。
func (in Input) Validate() (Input, error) {
	in.Title = strings.TrimSpace(in.Title)

	switch {
	case in.Title == "":
		return Input{}, &ValidationError{"タイトルを入力してください"}
	case utf8.RuneCountInString(in.Title) > TitleMax:
		return Input{}, &ValidationError{fmt.Sprintf("タイトルは%d文字以内です", TitleMax)}
	case in.Body == "":
		return Input{}, &ValidationError{"本文を入力してください"}
	case utf8.RuneCountInString(in.Body) > BodyMax:
		return Input{}, &ValidationError{fmt.Sprintf("本文は%d文字以内です", BodyMax)}
	}

	return in, nil
}
