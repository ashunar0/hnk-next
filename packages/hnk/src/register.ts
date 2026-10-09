import type { Env } from "hono";

/**
 * アプリが型を登録する場所。AppEnv を定義するファイルで
 * `declare module "hnk" { interface Register { env: AppEnv } }`、
 * 組み立てのファイルで `interface Register { deps: Deps }` と書く
 */
export interface Register {}

export type RegisteredEnv = Register extends { env: infer E extends Env }
  ? E
  : Env;

export type RegisteredDeps = Register extends { deps: infer D }
  ? D
  : Record<string, never>;
