// expect: hnk(layer-imports) | service が routes を import している。service は HTTP を知らない
import { r } from "./routes";

export const s = r;
