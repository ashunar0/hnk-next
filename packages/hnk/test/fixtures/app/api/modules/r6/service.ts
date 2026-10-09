// expect: hnk(no-id-cast) | InvoiceId を as で付けている
type InvoiceId = string & { readonly brand: true };

export const forged = "x" as InvoiceId;
export const widened = "x" as string;
