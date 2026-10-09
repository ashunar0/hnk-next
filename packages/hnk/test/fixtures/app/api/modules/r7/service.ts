// expect: hnk(no-clock-outside-inbound) | service が時計を読んでいる（new Date()）。今の時刻は入口が決める
// expect: hnk(no-clock-outside-inbound) | service が時計を読んでいる（Date.now()）
export const stamp = () => new Date();
export const ms = () => Date.now();

// 値からの変換は時計ではない
export const parse = (value: string) => new Date(value);
