// expect: hnk(no-await-in-call-arguments) | 呼び出しの引数の中で待っている
import { createRouter } from "hnk";

export const r4Router = createRouter();

const load = async () => 1;
const use = async (n: number) => n;
async function f() {
  return use(await load());
}
void f;
