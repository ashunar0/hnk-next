// domain は作る関数を定義する場所なので as を書いてよい
type InvoiceId = string & { readonly brand: true };

export const invoiceId = (value: string) => value as InvoiceId;
