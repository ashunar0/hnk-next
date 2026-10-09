import { createMiddleware } from "hono/factory";

import type { RegisteredDeps, RegisteredEnv } from "./register";
import type { Result } from "./result";
import { systemViewer } from "./system-value";
import type { System } from "./system";

/** 入口が受け取るもの。誰として呼ぶか（system）も、いつの出来事か（now）も、入口が決めずに受け取る */
export type CronContext = {
  deps: RegisteredDeps;
  system: System;
  /** 予定されていた時刻（実際に動いた時刻ではない） */
  now: Date;
};

export type QueueContext<Body> = CronContext & {
  body: Body;
};

type Bindings = RegisteredEnv["Bindings"];

/**
 * Workers の入口。HTTP は fetch、時刻は scheduled、キューは queue に渡す。
 *
 * - 依存は呼び出しごとに 1 回、makeDeps で組み立てる（HTTP は provideDeps が同じことをする）
 * - 利用者のいない入口なので、service を呼ぶための system をここが渡す。入口のファイルは作らず、受け取るだけ
 * - now はイベントから渡す。scheduled は予定の時刻、queue はメッセージが積まれた時刻
 *   （再送が日をまたいでも、同じ日付のまま扱える）
 * - queue の handler は Result を返す。ok なら ack、err なら retry。想定外の throw も、
 *   そのメッセージだけ retry にして、同じバッチの残りは処理を続ける
 */
export const createWorker = <Body = never>(options: {
  makeDeps: (env: Bindings) => RegisteredDeps;
  fetch: (
    request: Request,
    env: Bindings,
    ctx: ExecutionContext,
  ) => Response | Promise<Response>;
  scheduled?: (context: CronContext) => Promise<void>;
  queue?: (context: QueueContext<Body>) => Promise<Result<unknown, string>>;
}): ExportedHandler<Bindings, Body> => {
  const { makeDeps, fetch, scheduled, queue } = options;

  return {
    fetch,
    ...(scheduled && {
      async scheduled(controller, env) {
        await scheduled({
          deps: makeDeps(env),
          system: systemViewer,
          now: new Date(controller.scheduledTime),
        });
      },
    }),
    ...(queue && {
      async queue(batch, env) {
        const deps = makeDeps(env);

        for (const message of batch.messages) {
          try {
            const result = await queue({
              deps,
              system: systemViewer,
              now: message.timestamp,
              body: message.body,
            });
            if (result.ok) message.ack();
            else message.retry();
          } catch (error) {
            console.error("[queue] unhandled", error);
            message.retry();
          }
        }
      },
    }),
  };
};

/**
 * 認証を別の方法で確かめる入口（署名つきの webhook など）の宣言。
 * allowAnonymous と同じ並びで、route の middleware の先頭に置き、handler は `c.get("system")` で受け取る。
 * 署名を確かめるのは handler の仕事——確かめる前に system を使わない
 */
export const allowSystem = createMiddleware<{ Variables: { system: System } }>(
  async (c, next) => {
    c.set("system", systemViewer);
    await next();
  },
);
