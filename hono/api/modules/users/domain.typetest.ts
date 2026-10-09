import { authenticatedUser, orgId, userId } from "./domain";

// 利用者の ID と組織の ID は、どちらも文字列だが、取り違えると型エラーになる
export function idsAreNotInterchangeable() {
  // 正しい順序
  authenticatedUser(userId("u1"), orgId("o1"), "member");

  // @ts-expect-error 順序を逆にして渡せない
  authenticatedUser(orgId("o1"), userId("u1"), "member");
  // @ts-expect-error 素の string は渡せない
  authenticatedUser("u1", "o1", "member");
}
