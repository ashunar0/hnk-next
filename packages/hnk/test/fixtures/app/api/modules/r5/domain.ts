// expect: hnk(no-module-scope-state) | モジュールの一番上の let
// expect: hnk(no-module-scope-state) | モジュールの一番上の new Map()
export let counter = 0;
export const cache = new Map();
