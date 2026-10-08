import type { System } from "./system";

/** システムの値。hnk の中の createWorker と allowSystem だけが渡す。テストは hnk/testing から借りる */
export const systemViewer = { kind: "system" } as System;
