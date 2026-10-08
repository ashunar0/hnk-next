import { notFound } from "./errors";

/**
 * 不在を失敗に変える。null が service より先へ進むと、
 * ハンドラごとに if が生えて成功形が 2 つになる。
 *
 * 引数の形が findById を要求するので、その名前から外れた repository は渡せない。
 * 「不在が正常な答え」のとき（誰がログインしているか、など）はこれを通さない
 */
export const loadById = async <T>(
  repo: { findById(id: string): Promise<T | null> },
  id: string,
  message?: string,
): Promise<T> => {
  const row = await repo.findById(id);
  if (row === null) throw notFound(message);

  return row;
};
