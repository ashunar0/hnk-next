import type { System } from "./system";

/**
 * システムの値。hnk の中の createWorker と allowSystem だけが渡す。テストは hnk/testing から借りる。
 * 型（system.ts）と値をファイルで分けているのは、`hnk/system` として外に出すのを型だけにするため。
 * 値は package.json の exports に出さず、hnk の中と、テスト用の `hnk/testing` だけが持つ
 */
export const systemActor = { kind: "system" } as System;
