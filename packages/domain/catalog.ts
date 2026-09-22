export const interviewFields = [
  ["event", "发生了什么"],
  ["role", "当时的位置 / 角色"],
  ["knowledge", "当时知道什么"],
  ["options", "当时有哪些选择"],
  ["reason", "为什么这样选择"],
  ["outcome", "后来实际发生什么"],
  ["reflection", "今天怎么看"],
  ["evaluation", "最终评价"],
] as const;
export type InterviewKey = (typeof interviewFields)[number][0];
export const unknownLabels = {
  unknown: "不知道",
  forgotten: "记不清",
  cannot_judge: "无法判断",
  not_applicable: "当时没有这项",
} as const;
export const dimensions = [
  { key: "domain", label: "事件 / 问题领域", weight: 20 },
  { key: "role", label: "角色与责任位置", weight: 15 },
  { key: "goal", label: "决策目标", weight: 15 },
  { key: "constraints", label: "约束与资源结构", weight: 15 },
  { key: "options", label: "可见选项结构", weight: 15 },
  { key: "information", label: "当时信息与认知环境", weight: 10 },
  { key: "social", label: "社会 / 关系环境", weight: 5 },
  { key: "technology", label: "技术 / 时代条件", weight: 5 },
] as const;
export type Dimension = (typeof dimensions)[number]["key"];
export const questions = [
  [
    "你目前生活中最占精力的是",
    ["工作 / 事业", "家庭 / 感情", "收入 / 生存与调整"],
  ],
  [
    "你目前的职业状态更接近",
    ["稳定做一件事", "正在转换方向", "同时尝试几个方向"],
  ],
  [
    "你目前的家庭或亲密关系状态更接近",
    ["相对稳定", "正在发生变化", "目前主要以自己为中心安排生活"],
  ],
  [
    "一个重要机会突然出现，你通常先",
    ["先行动，边做边判断", "先收集足够信息再行动", "先找可信的人讨论"],
  ],
  [
    "两个选择都没有把握时，你更容易",
    ["选可能收益更大的", "选风险更小的", "暂时不选，继续观察"],
  ],
  [
    "作重大决定时，你最相信",
    ["自己过去的经验", "当前数据和事实", "专业人士或可信任人的意见"],
  ],
  [
    "已经投入很多，但发现方向可能不对时，你通常",
    ["尽快停止", "再试一段时间", "找到新证据以后再决定"],
  ],
  [
    "一件事情出了问题，但责任不完全在你，你通常",
    [
      "先把事情处理完再谈责任",
      "先把责任边界说清楚",
      "看损失和关系再决定是否继续介入",
    ],
  ],
  [
    "回看过去的重要选择，你目前更接近",
    [
      "多数决定基本符合当时条件",
      "有不少决定今天看来可以做得更好",
      "我还没有系统想过这个问题",
    ],
  ],
  [
    "如果今天必须作一个重要决定，你认为自己现在最缺的是",
    ["足够的信息", "对自己过去经验的参考", "更清楚自己真正想要什么"],
  ],
] as const;
export const planeFields = [
  "worldScope",
  "cognitionRadius",
  "informationSources",
  "technologyAccess",
  "socialSampleRange",
  "riskModel",
  "opportunityModel",
  "selfModel",
  "relationshipModel",
  "moneyModel",
  "workModel",
  "learningModel",
  "failureModel",
  "timeHorizon",
  "actionStyle",
  "uncertaintyHandling",
  "visibleOptionBreadth",
  "executionCapacity",
  "resourceCapacity",
  "physicalOrMemoryConstraints",
] as const;
export const exampleDecision = {
  happened: "一个新的合作项目出现，工作职责还没有明确。",
  urgency: "对方希望本周答复，时间有限。",
  options: "先做小范围试点；直接加入；暂缓合作。",
  stuck: "目标：收入与责任边界都很重要；信息：目前信息不足。",
};
