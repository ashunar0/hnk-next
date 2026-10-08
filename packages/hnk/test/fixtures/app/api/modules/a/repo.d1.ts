// expect: hnk(no-foreign-table-reads) | 他の module の表 bTable を読みに使っている。表は外部キーの references() の中でだけ使う
import { bTable } from "../b/repo.d1";

export const bad = (db: { select: () => { from: (t: unknown) => unknown } }) =>
  db.select().from(bTable);
