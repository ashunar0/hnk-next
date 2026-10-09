// expect: hnk(layer-imports) | routes が 他 module の errors を import している。他の module の失敗は借りない
import { BFailed } from "../b/errors";

const borrowed = BFailed;
void borrowed;
