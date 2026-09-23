// Interview questions are tied to named missing fields, not inferred motives.
export const gapFieldKeys = [
  "event", "role", "knowledge", "options", "reason", "outcome", "reflection", "evaluation",
  "chosenAction", "historicalBest", "goal", "constraints", "resources", "social", "technology",
] as const;
export type GapField = (typeof gapFieldKeys)[number];
export const gapCatalog: Record<GapField, { label: string; required: boolean; question: string }> = {
  event: {label:"发生了什么", required:true, question:"这一次具体发生了什么？"},
  role: {label:"当时的位置／角色", required:true, question:"在这件事里，你当时是什么身份，负责哪些事情？"},
  knowledge: {label:"当时已知信息", required:true, question:"作出这次选择之前，你已经掌握了哪些与它有关的信息？"},
  options: {label:"当时可见选择", required:true, question:"作出这次选择之前，你当时实际考虑过哪些做法？"},
  reason: {label:"当时选择的理由", required:true, question:"当时你为什么作出这个选择？"},
  outcome: {label:"后来实际发生什么", required:true, question:"作出这次选择以后，实际发生了什么？"},
  reflection: {label:"回忆时的看法", required:true, question:"站在本次回忆的时间点，你怎么看当时的选择？"},
  evaluation: {label:"用户最终评价", required:true, question:"你对当时这次选择的最终评价是什么？也可以说无法判断。"},
  chosenAction: {label:"当时实际选择", required:true, question:"当时你最终实际采取了什么做法？"},
  historicalBest: {label:"当时认为最合适的选择", required:true, question:"只站在那个时刻，你当时认为最合适的选择是什么？不是现在回头看的最优答案。"},
  goal: {label:"当时目标", required:false, question:"当时你想通过这个选择实现什么？"},
  constraints: {label:"当时约束", required:false, question:"在作出选择的那个时候，哪些条件限制了你？"},
  resources: {label:"当时可用资源", required:false, question:"在作出选择之前，你当时实际能调用哪些资源？"},
  social: {label:"当时关系环境", required:false, question:"当时有哪些人与这次选择有关，他们与你是什么关系？"},
  technology: {label:"当时技术条件", required:false, question:"当时与你这次选择有关的工具和技术条件是什么？"},
};
// Choose the next meaningful gap; do not ask the whole catalogue in one message.
export const questionOrder: GapField[] = ["event", "role", "knowledge", "options", "reason", "chosenAction", "historicalBest", "outcome", "reflection", "evaluation", "goal", "constraints", "resources", "social", "technology"];
