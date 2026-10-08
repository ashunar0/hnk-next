import { bTable } from "../b/repo.d1";

// 外部キーの references() の中なので、違反ではない
export const column = (c: { references: (f: () => unknown) => unknown }) =>
  c.references(() => bTable);
