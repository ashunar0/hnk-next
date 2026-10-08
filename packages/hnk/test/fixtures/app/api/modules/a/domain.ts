// expect: hnk(layer-imports) | domain が service を import している。domain はモノとルールだけ
import { thing } from "./service";

export const x = thing;
