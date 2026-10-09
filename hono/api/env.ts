import type { User } from "./modules/users/domain";

/** withUser が積む文脈変数。ハンドラ側で書き写さないための単一定義 */
export type AuthVariables = {
  /** セッションの利用者。ログインしていなければ null。handler は読まず、guard が actor に決める */
  user: User | null;
};

export type AppEnv = {
  Bindings: Env;
  Variables: AuthVariables;
};

declare module "hnk" {
  interface Register {
    env: AppEnv;
  }
}
