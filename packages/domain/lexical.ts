// A conservative exact-text index, not a semantic or psychological model.
// Keep compound words intact even when a host's ICU splits Chinese into characters.
const compounds = [
  "网约车", "自媒体", "短视频", "剪辑", "抖音", "谋生", "收入", "求职",
  "生计", "转让费", "房租", "租金", "料理店", "合作", "职责", "责任",
  "边界", "试点", "资金", "成本", "风险", "全职", "专职", "兼职",
  "副业", "工资", "预算", "合同", "期限", "搬砖", "课程", "运营",
  "订单", "供应商", "客户", "数据", "技术", "游戏", "视频", "工作",
  "医疗", "护理", "教育", "采购", "销售", "学习", "家庭", "关系",
].sort((a, b) => b.length - a.length);
const stop = new Set((
  "我 你 他 她 它 我们 你们 他们 自己 这个 那个 这些 那些 这样 那样 我把 我也 我只 我才 我要 我就 我所 就不是 是不是 看了 毕竟 明确 记录 也有 面临 正式 " +
  "的 了 是 在 和 与 或 又 就 也 都 呢 吧 啊 嘛 呗 嗯 呀 啦 么 嘛 " +
  "今天 现在 当时 以前 后来 那时候 时候 今年 去年 年前 年后 年底 月份 " +
  "已经 还是 只是 就是 所以 因为 然后 如果 但是 可是 而且 不过 同时 " +
  "觉得 认为 知道 其实 真正 确实 大约 大概 约莫 大致 比如 例如 " +
  "一个 两个 多少 很多 一些 一点 一直 非常 真的 所有 任何 什么 怎么 为什么 " +
  "只有 只能 还在 其中 这时 此刻 目前 以后 之前 之后 当中 开始 结束 " +
  "发生 事情 问题 选择 决定 重大 行业 方向 可能 可以 应该 必须 需要 " +
  "没有 不是 不再 不能 不会 不了 并非 未知 不知道 记不清 未记录 待补 " +
  "the a an and or of to in is are was were i you we it that this with for "
).split(/\s+/));
const protectedPattern = new RegExp(compounds.join("|"), "gu");
const segmenter = new Intl.Segmenter("zh", { granularity: "word" });
function useful(value: string) {
  return !stop.has(value) && !/^(?:我|你|他|她|它|咱)(?:们)?(?:把|就|也|只|都|才|还|会|要|的|了|能|想|在|又|跟|和|是)+$/u.test(value) &&
    !/^[一二两三四五六七八九十百千万零]+(?:年|月|日|个|次|岁)$/u.test(value) && !/^\d+(?:\.\d+)?(?:年|月|日|号|个|次|岁|块)?$/u.test(value) &&
    (/^[a-z][a-z0-9+.#_-]+$/iu.test(value) || /^[\p{Script=Han}]{2,}$/u.test(value));
}
export function contentTokens(text: string): string[] {
  const normalized = text.normalize("NFKC").toLowerCase();
  const found = new Set<string>();
  // Index exact compound occurrences only. No synonyms, inferred motives or outcomes.
  const remainder = normalized.replace(protectedPattern, (word) => {
    found.add(word);
    return " ";
  });
  for (const part of segmenter.segment(remainder)) {
    if (part.isWordLike && useful(part.segment)) found.add(part.segment);
  }
  return [...found].filter(useful).sort();
}
