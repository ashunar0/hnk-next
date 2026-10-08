import { err, ok, createWorker } from "hnk";
import { systemViewer } from "hnk/testing";
import { expect, it, vi } from "vitest";
import { makeDeps } from "../api/deps";

type Message = {
  body: string;
  timestamp: Date;
  ack: ReturnType<typeof vi.fn>;
  retry: ReturnType<typeof vi.fn>;
};

const message = (body: string, at = "2026-06-10T09:00:00Z"): Message => ({
  body,
  timestamp: new Date(at),
  ack: vi.fn(),
  retry: vi.fn(),
});

/** 本物の deps は組まず、渡されたことだけを見る。中身は使わない */
const fakeDeps = { marker: "deps" } as unknown as ReturnType<typeof makeDeps>;

const worker = (queue: Parameters<typeof createWorker<string>>[0]["queue"]) =>
  createWorker<string>({
    makeDeps: () => fakeDeps,
    fetch: () => new Response("ok"),
    queue,
  });

const run = (handler: ReturnType<typeof worker>, messages: Message[]) =>
  handler.queue!({ queue: "q", messages } as never, {} as never, {} as never);

it("queue: ok は ack、err は retry。想定外の throw も、そのメッセージだけ retry で、残りは処理を続ける", async () => {
  const [a, b, c, d] = [message("ok"), message("err"), message("boom"), message("ok")];
  const seen: string[] = [];
  const handler = worker(async ({ body }) => {
    seen.push(body);
    if (body === "boom") throw new Error("unexpected");
    return body === "err" ? err("MAIL_FAILED") : ok("SENT");
  });
  vi.spyOn(console, "error").mockImplementation(() => {});

  await run(handler, [a, b, c, d]);

  expect(seen).toEqual(["ok", "err", "boom", "ok"]);
  expect([a, d].map((m) => [m.ack.mock.calls.length, m.retry.mock.calls.length])).toEqual([
    [1, 0],
    [1, 0],
  ]);
  expect([b, c].map((m) => [m.ack.mock.calls.length, m.retry.mock.calls.length])).toEqual([
    [0, 1],
    [0, 1],
  ]);
});

it("queue: now はメッセージが積まれた時刻、system と deps は入口が渡す", async () => {
  const m = message("x", "2026-06-09T23:59:00Z");
  const received: unknown[] = [];
  const handler = worker(async (context) => {
    received.push(context);
    return ok(undefined);
  });

  await run(handler, [m]);

  expect(received).toEqual([{ deps: fakeDeps, system: systemViewer, now: m.timestamp, body: "x" }]);
});

it("scheduled: now は予定の時刻", async () => {
  const received: unknown[] = [];
  const handler = createWorker({
    makeDeps: () => fakeDeps,
    fetch: () => new Response("ok"),
    scheduled: async (context) => {
      received.push(context);
    },
  });
  const scheduledTime = new Date("2026-06-10T00:00:00Z").getTime();

  await handler.scheduled!({ scheduledTime } as never, {} as never, {} as never);

  expect(received).toEqual([
    { deps: fakeDeps, system: systemViewer, now: new Date(scheduledTime) },
  ]);
});

it("使わない入口は持たない", () => {
  const handler = createWorker({ makeDeps: () => fakeDeps, fetch: () => new Response("ok") });

  expect(handler.scheduled).toBeUndefined();
  expect(handler.queue).toBeUndefined();
});
