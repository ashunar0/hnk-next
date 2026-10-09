/**
 * invoices だけの失敗を、HTTP でどう返すか。どの module でも同じ意味のものは api/errors.ts にある
 */
import { httpError } from "hnk";

export const NotDraft = httpError("NOT_DRAFT", 409, "下書きの請求書だけを送付できます");
