/**
 * システム（利用者のいない呼び出し元）の型。cron・キュー・webhook が、service を呼ぶときの「誰として」。
 * 値を作る場所は hnk の中の 1 か所だけ（system-value.ts）で、アプリは作れず、受け取るだけ。
 * この印は外から名前が見えないので、`{ kind: "system" }` と書いてもシステムにはなれない。
 * ロールではないので、ロールを文字列で扱う場所に紛れ込まない
 */
declare const mark: unique symbol;

export type System = { readonly kind: "system"; readonly [mark]: true };
