/**
 * webhook の入口だけの失敗。モノの失敗（NotPayable など）は domain.ts にある。
 * どの module でも同じ意味のものは hnk の標準（NotFound など）にある
 */
import { httpError } from "hnk";

export const InvalidSignature = httpError("INVALID_SIGNATURE", 400, "通知の署名が正しくありません");
