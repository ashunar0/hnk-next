/**
 * 一意制約の違反か。drizzle がエラーを包むことがあるので、cause を辿って D1 の文面を探す。
 * repo の insert / update の catch で使い、違反なら失敗の値を返し、違反でなければ throw し直す
 */
export const isUniqueViolation = (error: unknown): boolean => {
  for (let e: unknown = error; e instanceof Error; e = e.cause) {
    if (e.message.includes("UNIQUE constraint failed")) return true;
  }

  return false;
};
