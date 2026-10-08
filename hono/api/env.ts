/** withViewer が積む文脈変数。ハンドラ側で書き写さないための単一定義 */
export type AuthVariables = {
  /** ログインしていなければ null */
  viewerId: string | null;
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
