// expect: hnk(layer-imports) | repo が 他 module の repo から toB を import している。他 module の repo から借りてよいのは、外部キーの表（〜Table）と、読ませる窓口（〜Within）だけ
import { bWithin, toB } from "../b/repo.d1";

export const read = (db: unknown) => toB(bWithin(db));
