"use client";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import {
  dimensions,
  exampleDecision,
  interviewFields,
  questions,
  unknownLabels,
  type InterviewKey,
} from "../../packages/domain/catalog";
import {
  type Answer,
  type ArchiveDocument,
  type HistoricalEvent,
} from "../../packages/domain/model";
import {
  missingFields,
  classifyExplicitNarration,
} from "../../packages/domain/workflow";

type Page =
  | "welcome"
  | "baseline"
  | "artifact"
  | "interview"
  | "archive"
  | "empower"
  | "timeline";
type Draft = { state: Answer["state"]; text: string };
type Artifact = Extract<ArchiveDocument, { _type: "artifact" }>;
type Session = Extract<ArchiveDocument, { _type: "empowermentSession" }>;
const navigation: [Page, string, string][] = [
  ["welcome", "起点", "01"],
  ["artifact", "物件与访谈", "02"],
  ["archive", "历史档案", "03"],
  ["empower", "赋能", "04"],
  ["timeline", "认知轨迹", "05"],
];
async function api(action: string, payload: unknown) {
  const r = await fetch("/api/archive", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(data.error);
  return data;
}
function Source({ answer }: { answer: Answer }) {
  return (
    <span className="source">
      {answer.state !== "known" && <b>{unknownLabels[answer.state]} · </b>}
      {answer.provenance.map((p, i) => (
        <span key={i}>
          {p.strength} · {p.sourceRef._ref.slice(0, 18)} / {p.sourceField}
        </span>
      ))}
    </span>
  );
}
function AnswerInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: Draft;
  onChange: (v: Draft) => void;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <select
        aria-label={`${label}状态`}
        value={value.state}
        onChange={(e) => {
          const state = e.target.value as Answer["state"];
          onChange({
            state,
            text: state === "known" ? "" : unknownLabels[state],
          });
        }}
      >
        <option value="known">按原话记录</option>
        {Object.entries(unknownLabels).map(([k, v]) => (
          <option key={k} value={k}>
            {v}
          </option>
        ))}
      </select>
      <textarea
        aria-label={label}
        value={value.text}
        onChange={(e) => onChange({ ...value, text: e.target.value })}
        readOnly={value.state !== "known"}
        rows={3}
      />
    </label>
  );
}

export default function Demo() {
  const [page, setPage] = useState<Page>("welcome"),
    [documents, setDocuments] = useState<ArchiveDocument[]>([]),
    [mode, setMode] = useState("读取中"),
    [personal, setPersonal] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [choices, setChoices] = useState<number[]>(Array(10).fill(-1));
  const [artifact, setArtifact] = useState<Artifact | null>(null),
    [artifactConfirmed, setArtifactConfirmed] = useState(false),
    [narration, setNarration] = useState(""),
    [interviewStage, setInterviewStage] = useState<
      "facts" | "narration" | "gaps" | "review"
    >("facts");
  const [fields, setFields] = useState<Partial<Record<InterviewKey, Draft>>>(
      {},
    ),
    [answerDraft, setAnswerDraft] = useState<Draft>({
      state: "known",
      text: "",
    });
  const [chosenAction, setChosenAction] = useState<Draft>({
      state: "known",
      text: "",
    }),
    [historicalBest, setHistoricalBest] = useState<Draft>({
      state: "known",
      text: "",
    }),
    [title, setTitle] = useState(""),
    [eventDate, setEventDate] = useState("");
  const [selected, setSelected] = useState<string>("demo-event-1"),
    [current, setCurrent] = useState({
      happened: "",
      urgency: "",
      options: "",
      stuck: "",
    }),
    [session, setSession] = useState<Session | null>(null),
    [resultEvents, setResultEvents] = useState<HistoricalEvent[]>([]);
  const events = documents.filter(
    (d): d is HistoricalEvent => d._type === "historicalEvent",
  );
  const gaps = missingFields(fields);
  async function refresh(p = personal) {
    const r = await fetch(`/api/archive?personal=${p}`);
    const data = await r.json();
    if (!r.ok) throw new Error(data.error);
    setDocuments(data.documents);
    setMode(data.mode);
  }
  useEffect(() => {
    refresh(personal).catch((e) =>
      setError(e.message),
    ); /* mode changes reload the selected archive */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [personal]);
  async function run(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(e instanceof Error ? e.message : "操作未完成");
    } finally {
      setBusy(false);
    }
  }
  function navigate(p: Page) {
    setPage(p);
    setError("");
    setNotice("");
  }
  async function saveArtifact(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    await run(async () => {
      const kind = form.get("kind") as "text" | "image_metadata";
      const file = form.get("image") as File;
      let fileMetadata;
      if (kind === "image_metadata") {
        if (!file?.size || !file.type.startsWith("image/"))
          throw new Error(
            "请选择图片。当前封存其元数据及内容哈希；图片本体不会上传。",
          );
        if (file.size > 20 * 1024 * 1024)
          throw new Error("Demo 图片上限为 20MB。");
        const hash = Array.from(
          new Uint8Array(
            await crypto.subtle.digest("SHA-256", await file.arrayBuffer()),
          ),
        )
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        fileMetadata = {
          name: file.name,
          mimeType: file.type,
          size: file.size,
          path: `user-held://${file.name}`,
          contentHash: hash,
        };
      }
      const demo = !personal;
      if (demo && form.get("synthetic") !== "on")
        throw new Error(
          "只有明确勾选的虚构演示资料可写入公开演示库。个人资料请切换到本地个人档案。",
        );
      const result = await api("artifact", {
        title: form.get("title"),
        kind,
        originalText: String(form.get("text") || ""),
        originalDate: form.get("date") || null,
        fileMetadata,
        demo,
      });
      setArtifact(result.document);
      setArtifactConfirmed(false);
      setNarration("");
      setFields({});
      setTitle(String(form.get("title")));
      setEventDate("");
      setChosenAction({ state: "known", text: "" });
      setHistoricalBest({ state: "known", text: "" });
      setInterviewStage("facts");
      setPage("interview");
      await refresh();
    });
  }
  async function seal() {
    await run(async () => {
      if (!artifact) throw new Error("缺少物件");
      const result = await api("seal", {
        artifactId: artifact._id,
        title,
        narration,
        fields,
        chosenAction,
        historicalBest,
        eventDate: eventDate || null,
        confirmed: true,
        artifactConfirmed,
        demo: artifact.demo,
      });
      const event = result.documents.find(
        (d: ArchiveDocument) => d._type === "historicalEvent",
      );
      await refresh();
      setSelected(event._id);
      setPage("archive");
      setNotice("事件已封存。之后的认识只能新增关联记录。");
      setArtifact(null);
    });
  }
  const selectedEvent = events.find((e) => e._id === selected) || events[0];
  return (
    <div className="shell">
      <aside>
        <Link
          className="brand"
          href="/"
          aria-label="叙能首页"
          onClick={() => navigate("welcome")}
        >
          <span className="brand-mark">叙</span>
          <span>
            叙能<small>TELL ME MORE</small>
          </span>
        </Link>
        <p className="side-note">
          让过去的自己，
          <br />
          在重要时刻出现。
        </p>
        <nav aria-label="主导航">
          {navigation.map(([id, label, n]) => (
            <button
              key={id}
              className={
                page === id ||
                (id === "artifact" && page === "interview") ||
                (id === "welcome" && page === "baseline")
                  ? "active"
                  : ""
              }
              onClick={() => navigate(id)}
            >
              <span>{n}</span>
              {label}
              <i>↗</i>
            </button>
          ))}
        </nav>
        <div className="side-bottom">
          <span className="status-dot" /> 单用户 · 本地 Demo
          <br />
          <small>历史不替你决定未来。</small>
        </div>
      </aside>
      <div className="main">
        <header>
          <span>
            个人历史 /{" "}
            <b>{navigation.find(([id]) => id === page)?.[1] || "记录"}</b>
          </span>
          <button
            className="mode"
            onClick={() => {
              setPersonal(!personal);
              setSession(null);
              setPage("welcome");
            }}
          >
            {personal ? "本地个人档案" : "虚构演示档案"} <span>⇄</span>
          </button>
        </header>
        <main>
          <div className="storage">
            <span className="status-dot" />
            {mode === "sanity-groq"
              ? "SANITY CONTENT LAKE · 实时结构化档案"
              : mode === "local-demo"
                ? "LOCAL ARCHIVE · 本地持久化档案"
                : mode}
            <span>
              {personal
                ? "个人数据与演示数据隔离"
                : "全部示例均为虚构，非你的真实经历"}
            </span>
          </div>
          {error && (
            <div className="alert error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="alert" role="status">
              {notice}
            </div>
          )}
          {page === "welcome" && (
            <>
              <section className="hero">
                <div>
                  <p className="eyebrow">YOUR HISTORY, YOUR REFERENCE</p>
                  <h1>
                    历史是参照。
                    <br />
                    <em>选择属于你。</em>
                  </h1>
                  <p className="lead">
                    从一件物件、一段经历开始。
                    <br />
                    还原当时知道什么、为什么选择，
                    <br />
                    让真实的个人历史成为今天的第二参照。
                  </p>
                  <div className="actions">
                    <button
                      className="primary"
                      onClick={() => navigate("baseline")}
                    >
                      建立我的 T0 起点 <span>↗</span>
                    </button>
                    <button
                      className="text-button"
                      onClick={() => navigate("empower")}
                    >
                      体验历史赋能 →
                    </button>
                  </div>
                  <small>10 个问题 · 没有标准答案 · 不作人格判断</small>
                </div>
                <div className="orbit" aria-hidden="true">
                  <div className="orbit-ring one" />
                  <div className="orbit-ring two" />
                  <div className="orbit-ring three" />
                  <div className="orbit-center">
                    我<small>此刻</small>
                  </div>
                  <span className="orbit-node n1">
                    2018
                    <br />
                    <b>一次合作</b>
                  </span>
                  <span className="orbit-node n2">
                    2021
                    <br />
                    <b>一次试点</b>
                  </span>
                  <span className="orbit-node n3">
                    T0
                    <br />
                    <b>现在的我</b>
                  </span>
                  <span className="orbit-caption">
                    每一次选择，都有当时的理由。
                  </span>
                </div>
              </section>
              <section className="steps-grid">
                <article>
                  <span>01 / 留下证据</span>
                  <h3>从真实物件出发</h3>
                  <p>原件立即封存。你的回忆与系统整理，分别保存。</p>
                </article>
                <article>
                  <span>02 / 还原当时</span>
                  <h3>把选择放回情境</h3>
                  <p>保留当时可见的选项，也允许不知道、记不清。</p>
                </article>
                <article>
                  <span>03 / 调用历史</span>
                  <h3>找到相似的过去</h3>
                  <p>看共同点、差异和来源。最终决定始终由你完成。</p>
                </article>
              </section>
              <div className="section-heading">
                <h2>已封存的演示片段</h2>
                <button
                  className="text-button"
                  onClick={() => navigate("archive")}
                >
                  查看档案 →
                </button>
              </div>
              <div className="event-grid">
                {events.slice(0, 3).map((e) => (
                  <button
                    className="event-tile"
                    key={e._id}
                    onClick={() => {
                      setSelected(e._id);
                      navigate("archive");
                    }}
                  >
                    <span className="pill">
                      {e.demo ? "虚构演示" : "个人历史"} · SEALED
                    </span>
                    <small>{e.eventStartDate || "时间未知"}</small>
                    <h3>{e.title}</h3>
                    <p>{e.decisionNodes[0].chosenAction.text}</p>
                    <span className="tile-arrow">↗</span>
                  </button>
                ))}
              </div>
            </>
          )}
          {page === "baseline" && (
            <>
              <PageTitle
                kicker="T0 · YOUR REGISTRATION ANCHOR"
                title="先认识，现在的你。"
                text="这 10 个问题建立注册时的认知快照。T0 不是人生起点，也不是更好的标准。只选最接近你现在真实情况的一项。"
              />
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  run(async () => {
                    await api("baseline", { choices, demo: !personal });
                    await refresh();
                    setNotice("T0 及来源问卷已封存。");
                    setPage("timeline");
                  });
                }}
              >
                <div className="question-list">
                  {questions.map(([q, options], i) => (
                    <fieldset key={q}>
                      <legend>
                        <span>{String(i + 1).padStart(2, "0")}</span>
                        {q}
                      </legend>
                      <div className="choice-row">
                        {options.map((o, j) => (
                          <label
                            className={
                              choices[i] === j ? "choice selected" : "choice"
                            }
                            key={o}
                          >
                            <input
                              type="radio"
                              required
                              name={`q${i}`}
                              checked={choices[i] === j}
                              onChange={() =>
                                setChoices(
                                  choices.map((v, k) => (k === i ? j : v)),
                                )
                              }
                            />
                            {o}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                  ))}
                </div>
                <div className="sticky-actions">
                  <span>
                    {choices.filter((c) => c >= 0).length} / 10 已选择
                    {!personal ? " · 当前按虚构演示问卷保存" : ""}
                  </span>
                  <button
                    disabled={busy || choices.some((c) => c < 0)}
                    className="primary"
                  >
                    确认并封存 T0 →
                  </button>
                </div>
              </form>
            </>
          )}
          {page === "artifact" && (
            <>
              <PageTitle
                kicker="01 · EVIDENCE FIRST"
                title="一件物件，一段过去。"
                text="文字原件立即保存并生成 SHA-256。图片 Demo 保存元数据与内容哈希，原图仍由你保管；不进行 OCR 或内容猜测。"
              />
              <form className="panel form-panel" onSubmit={saveArtifact}>
                <label className="field">
                  物件标题
                  <input
                    name="title"
                    required
                    placeholder="例如：那封关于合作的邮件"
                  />
                </label>
                <div className="two-cols">
                  <label className="field">
                    物件类型
                    <select name="kind">
                      <option value="text">文字原件</option>
                      <option value="image_metadata">图片元数据</option>
                    </select>
                  </label>
                  <label className="field">
                    物件原始日期（可未知）
                    <input type="date" name="date" />
                  </label>
                </div>
                <label className="field">
                  原始文字
                  <textarea
                    name="text"
                    rows={7}
                    placeholder="原样粘贴。保存后不再修改。"
                  />
                </label>
                <label className="field">
                  图片（仅图片路径、元数据和哈希）
                  <input type="file" name="image" accept="image/*" />
                </label>
                {!personal && (
                  <label className="check">
                    <input name="synthetic" type="checkbox" required />
                    我确认这是虚构演示资料，可写入公开演示库。
                  </label>
                )}
                <button className="primary" disabled={busy}>
                  保存原件并立即封存 →
                </button>
              </form>
            </>
          )}
          {page === "interview" && artifact && (
            <>
              <PageTitle
                kicker="02 · RECALL IN YOUR OWN WORDS"
                title="慢慢说，我只记录。"
                text="不判断、不补全、不改写。原件、回忆与分类索引分别保存。"
              />
              <div className="interview-layout">
                <aside className="evidence-panel">
                  <span className="pill">原件已封存</span>
                  <h3>{artifact.title}</h3>
                  <pre>
                    {artifact.kind === "text"
                      ? artifact.originalText
                      : JSON.stringify(artifact.fileMetadata, null, 2)}
                  </pre>
                  <p className="source">SHA-256 {artifact.sha256}</p>
                  <p className="source">{artifact._id}</p>
                  <div className="completeness">
                    <b>{8 - gaps.length} / 8</b>
                    <span>字段已记录或明确未知</span>
                  </div>
                  {interviewFields.map(([k, label]) => (
                    <div key={k} className="field-state">
                      <span>{fields[k] ? "✓" : "○"}</span>
                      {label}
                    </div>
                  ))}
                </aside>
                <div className="panel">
                  {interviewStage === "facts" && (
                    <>
                      <h2>先确认物件识别</h2>
                      <p>
                        左侧逐字显示文字原件，或图片文件的元数据。没有从图片推断任何事件事实。
                      </p>
                      <button
                        className="primary"
                        onClick={() => {
                          setArtifactConfirmed(true);
                          setInterviewStage("narration");
                        }}
                      >
                        识别准确，开始叙述 →
                      </button>
                    </>
                  )}
                  {interviewStage === "narration" && (
                    <>
                      <h2>你可以从任何地方说起</h2>
                      <p>
                        这段话会逐字保存。完成叙述后，再由你把原话归入字段。明确写成「发生了什么：原句」等独立行的内容会自动归类；未标明的内容不猜测。
                      </p>
                      <textarea
                        aria-label="自由叙述"
                        rows={13}
                        value={narration}
                        onChange={(e) => setNarration(e.target.value)}
                        placeholder="那时发生了什么……"
                      />
                      <button
                        className="primary"
                        disabled={!narration.trim()}
                        onClick={() => {
                          setFields({
                            ...fields,
                            ...classifyExplicitNarration(narration),
                          });
                          setInterviewStage("gaps");
                        }}
                      >
                        叙述结束，检查缺口 →
                      </button>
                    </>
                  )}
                  {interviewStage === "gaps" && (
                    <>
                      <details open>
                        <summary>你的原话 · 不改写</summary>
                        <pre>{narration}</pre>
                      </details>
                      {gaps.length ? (
                        <>
                          <p className="eyebrow">只询问尚缺字段</p>
                          <h2>{gaps[0].question}</h2>
                          <AnswerInput
                            label={
                              interviewFields.find(
                                ([k]) => k === gaps[0].key,
                              )![1]
                            }
                            value={answerDraft}
                            onChange={setAnswerDraft}
                          />
                          <p className="muted">
                            可以粘贴上方原话中的对应片段。未知与遗忘都是有效回答。
                          </p>
                          <button
                            className="primary"
                            disabled={!answerDraft.text.trim()}
                            onClick={() => {
                              setFields({
                                ...fields,
                                [gaps[0].key]: answerDraft,
                              });
                              setAnswerDraft({ state: "known", text: "" });
                            }}
                          >
                            记录这个字段 →
                          </button>
                        </>
                      ) : (
                        <>
                          <h2>八字段已完整</h2>
                          <p>
                            下列两个选择节点字段尚未单独记录，请使用你的原话或明确未知状态。
                          </p>
                          <AnswerInput
                            label="当时实际选择"
                            value={chosenAction}
                            onChange={setChosenAction}
                          />
                          <AnswerInput
                            label="当时最佳决策（你在当时认为最合适的选择）"
                            value={historicalBest}
                            onChange={setHistoricalBest}
                          />
                          <label className="field">
                            事件标题
                            <input
                              value={title}
                              onChange={(e) => setTitle(e.target.value)}
                            />
                          </label>
                          <label className="field">
                            事件日期（留空即未知）
                            <input
                              type="date"
                              value={eventDate}
                              onChange={(e) => setEventDate(e.target.value)}
                            />
                          </label>
                          <button
                            className="primary"
                            disabled={
                              !chosenAction.text ||
                              !historicalBest.text ||
                              !title
                            }
                            onClick={() => setInterviewStage("review")}
                          >
                            查看并确认封存内容 →
                          </button>
                        </>
                      )}
                    </>
                  )}
                  {interviewStage === "review" && (
                    <>
                      <h2>让这段历史保持原样。</h2>
                      <p>请核对原话与分类。确认后档案只追加，不改写。</p>
                      <h3>回忆原话</h3>
                      <pre>{narration}</pre>
                      <h3>分类索引 · 使用你提供的原句</h3>
                      {interviewFields.map(([k, label]) => (
                        <div className="review-row" key={k}>
                          <b>{label}</b>
                          <p>{fields[k]?.text}</p>
                        </div>
                      ))}
                      <div className="highlight">
                        <b>当时最佳决策 · 用户主观最优</b>
                        <p>{historicalBest.text}</p>
                      </div>
                      <div className="actions">
                        <button
                          className="primary"
                          disabled={busy}
                          onClick={seal}
                        >
                          我确认以上记录，封存入库
                        </button>
                        <button
                          className="text-button"
                          disabled={busy}
                          onClick={() => {
                            setFields({});
                            setInterviewStage("narration");
                          }}
                        >
                          返回临时整理区
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          )}
          {page === "interview" && !artifact && (
            <div className="panel">
              <h2>请先保存一件物件</h2>
              <button className="primary" onClick={() => navigate("artifact")}>
                添加物件
              </button>
            </div>
          )}
          {page === "archive" && (
            <>
              <PageTitle
                kicker="03 · SEALED HISTORY"
                title="过去，有据可循。"
                text="原始证据、用户回忆、系统分类三层独立。封存后的新认识，以新记录关联。"
              />
              <div className="archive-layout">
                <div className="event-list">
                  {events.map((e) => (
                    <button
                      key={e._id}
                      className={selectedEvent?._id === e._id ? "selected" : ""}
                      onClick={() => setSelected(e._id)}
                    >
                      <small>
                        {e.eventStartDate || "时间未知"} ·{" "}
                        {e.demo ? "虚构演示" : "个人记录"}
                      </small>
                      <b>{e.title}</b>
                    </button>
                  ))}
                </div>
                {selectedEvent ? (
                  <EventDetail
                    event={selectedEvent}
                    documents={documents}
                    onAppend={(verbatim) =>
                      run(async () => {
                        await api("append-recall", {
                          eventId: selectedEvent._id,
                          verbatim,
                          demo: selectedEvent.demo,
                        });
                        await refresh();
                        setNotice("新回忆已追加；原事件未改动。");
                      })
                    }
                  />
                ) : (
                  <div className="panel">
                    尚无封存事件。
                    <button onClick={() => navigate("artifact")}>
                      从物件开始 →
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
          {page === "empower" && (
            <>
              <PageTitle
                kicker="04 · A SECOND REFERENCE"
                title="此刻的选择，过去的参照。"
                text="说明四件事，再从你的历史中寻找可比较的情境。历史结果只供回看，不参与相似匹配。"
              />
              <div className="empower-grid">
                <form
                  className="panel decision-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    run(async () => {
                      const result = await api("empower", {
                        current,
                        demo: !personal,
                      });
                      setSession(result.document);
                      setResultEvents(result.events);
                      await refresh();
                    });
                  }}
                >
                  {(
                    [
                      ["happened", "发生了什么"],
                      ["urgency", "为什么现在必须选择"],
                      ["options", "现在有哪些选择"],
                      ["stuck", "卡在哪里"],
                    ] as const
                  ).map(([key, label], i) => (
                    <label className="field" key={key}>
                      <span>
                        <small>0{i + 1}</small> {label}
                      </span>
                      <textarea
                        required
                        value={current[key]}
                        onChange={(e) =>
                          setCurrent({ ...current, [key]: e.target.value })
                        }
                        rows={3}
                      />
                    </label>
                  ))}
                  <div className="actions">
                    <button className="primary" disabled={busy}>
                      {busy ? "正在查阅历史…" : "调用相似历史 ↗"}
                    </button>
                    {!personal && (
                      <button
                        type="button"
                        className="text-button"
                        onClick={() => setCurrent(exampleDecision)}
                      >
                        填入演示问题
                      </button>
                    )}
                  </div>
                </form>
                <div className="empower-explainer">
                  <span className="eyebrow">透明的比较依据</span>
                  <h3>不只给一个百分比。</h3>
                  <p>
                    按原文分词，比较词汇交集 /
                    并集。直接比较事件、紧迫条件与选项。其余维度只有在你明确写出「角色：…；目标：…；信息：…；关系：…；技术：…」时才参与；没有说明就保留未知。
                  </p>
                  {dimensions.map((d) => (
                    <div className="weight" key={d.key}>
                      <span>{d.label}</span>
                      <b>{d.weight}</b>
                    </div>
                  ))}
                  <small>
                    缺失字段计 0 分，并降低可比信息量。分数不是未来结果的概率。
                  </small>
                </div>
              </div>
              {session && (
                <section className="results" aria-live="polite">
                  <div className="section-heading">
                    <h2>找到 {session.matches.length} 段有共同依据的历史</h2>
                    <span className="pill">{session.retrievalMode}</span>
                  </div>
                  <div className="alert">{session.retrievalNotice}</div>
                  {session.matches.map((m, i) => {
                    const e = resultEvents.find(
                      (e) => e._id === m.eventRef._ref,
                    )!;
                    return (
                      <article className="panel match" key={m.eventRef._ref}>
                        <div className="match-heading">
                          <div>
                            <span className="eyebrow">
                              REFERENCE 0{i + 1} · {e.eventStartDate} ·{" "}
                              {e.demo ? "虚构演示" : "个人历史"}
                            </span>
                            <h2>{e.title}</h2>
                          </div>
                          <div className="match-number">
                            {m.score}
                            <small>加权分 / 100</small>
                          </div>
                        </div>
                        <div className="time-layers">
                          <div>
                            <span>事件当时</span>
                            <h4>{e.decisionNodes[0].chosenAction.text}</h4>
                            <p>{e.fields.reason.text}</p>
                            <small>实际结果：{e.fields.outcome.text}</small>
                          </div>
                          <div>
                            <span>访谈当时 · {e.recordedAt.slice(0, 10)}</span>
                            <p>{e.fields.reflection.text}</p>
                            <small>用户评价：{e.fields.evaluation.text}</small>
                          </div>
                          <div>
                            <span>当前时刻</span>
                            <p>{session.current.happened}</p>
                            <small>可比信息权重：{m.coverage} / 100</small>
                          </div>
                        </div>
                        <details>
                          <summary>展开相似依据、差异与逐项来源</summary>
                          <div className="table-wrap">
                            <table>
                              <thead>
                                <tr>
                                  <th>维度 / 权重</th>
                                  <th>共同词</th>
                                  <th>当前独有 / 历史独有</th>
                                  <th>分项</th>
                                  <th>来源</th>
                                </tr>
                              </thead>
                              <tbody>
                                {m.components.map((c) => (
                                  <tr key={c.key}>
                                    <td>
                                      {c.label} / {c.weight}
                                    </td>
                                    <td>
                                      {c.comparable
                                        ? c.matched.join("、") || "无共同词"
                                        : "未知，不作证据"}
                                    </td>
                                    <td>
                                      {c.currentOnly.join("、") || "—"}
                                      <hr />
                                      {c.historicalOnly.join("、") || "—"}
                                    </td>
                                    <td>{c.earned.toFixed(2)}</td>
                                    <td className="source">
                                      {c.currentSource}
                                      <br />
                                      {c.eventRef._ref}
                                      <br />
                                      {c.historicalSource}
                                      <br />
                                      {c.provenance[0].sourceRef._ref}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </details>
                        <button
                          className="text-button"
                          onClick={() => {
                            setSelected(e._id);
                            navigate("archive");
                          }}
                        >
                          回到来源事件 · {e._id} →
                        </button>
                      </article>
                    );
                  })}
                  <div className="closing-note">{session.conclusion}</div>
                </section>
              )}
            </>
          )}
          {page === "timeline" && <Timeline documents={documents} />}
        </main>
        <footer>
          叙能 / TELL ME MORE <span>忠实记录 · 保留未知 · 选择自主</span>
        </footer>
      </div>
    </div>
  );
}

function PageTitle({
  kicker,
  title,
  text,
}: {
  kicker: string;
  title: string;
  text: string;
}) {
  return (
    <div className="page-title">
      <p className="eyebrow">{kicker}</p>
      <h1>{title}</h1>
      <p className="lead">{text}</p>
    </div>
  );
}
function EventDetail({
  event,
  documents,
  onAppend,
}: {
  event: HistoricalEvent;
  documents: ArchiveDocument[];
  onAppend: (text: string) => Promise<void>;
}) {
  const [recall, setRecall] = useState("");
  const artifacts = documents.filter(
    (d): d is Artifact =>
      d._type === "artifact" &&
      event.artifactRefs.some((r) => r._ref === d._id),
  );
  const memories = documents.filter(
    (d): d is Extract<ArchiveDocument, { _type: "memoryStatement" }> =>
      d._type === "memoryStatement" &&
      d.eventRefs.some((r) => r._ref === event._id),
  );
  return (
    <article className="panel event-detail">
      <span className="pill">
        SEALED · {event.demo ? "虚构演示" : "个人记录"}
      </span>
      <h2>{event.title}</h2>
      <p className="source">
        事件时间 {event.eventStartDate || "未知"} · 回忆记录 {event.recordedAt}
        <br />
        来源 ID {event._id}
      </p>
      <section>
        <h3>
          <span>01</span> 原始证据层
        </h3>
        {artifacts.map((a) => (
          <div key={a._id}>
            <pre>
              {a.originalText || JSON.stringify(a.fileMetadata, null, 2)}
            </pre>
            <p className="source">
              {a._id}
              <br />
              SHA-256 {a.sha256}
            </p>
          </div>
        ))}
      </section>
      <section>
        <h3>
          <span>02</span> 回忆与解释层
        </h3>
        {memories.map((m) => (
          <details key={m._id} open>
            <summary>
              {m.recordedAt.slice(0, 10)} · 用户原话 · {m._id.slice(0, 20)}
            </summary>
            <pre>{m.verbatim}</pre>
          </details>
        ))}
      </section>
      <section>
        <h3>
          <span>03</span> 系统分类层 · 原句索引
        </h3>
        {interviewFields.map(([k, label]) => (
          <div className="review-row" key={k}>
            <b>{label}</b>
            <p>{event.fields[k].text}</p>
            <Source answer={event.fields[k]} />
          </div>
        ))}
      </section>
      <section>
        <h3>选择节点</h3>
        {event.decisionNodes.map((d, i) => (
          <div className="highlight" key={d.decisionId}>
            <span>节点 {i + 1}</span>
            <h4>实际选择：{d.chosenAction.text}</h4>
            <b>当时最佳决策 · 用户主观最优</b>
            <p>{d.historicalBestDecisionStatement.text}</p>
            <Source answer={d.historicalBestDecisionStatement} />
            <p>当时的信息：{d.informationAvailable.text}</p>
            <p>后来实际结果：{d.immediateResult.text}</p>
          </div>
        ))}
      </section>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          await onAppend(recall);
          setRecall("");
        }}
      >
        <label className="field">
          后来想起了什么？新增关联记录
          <textarea
            required
            value={recall}
            onChange={(e) => setRecall(e.target.value)}
            rows={3}
          />
        </label>
        <button className="secondary">追加新回忆</button>
      </form>
    </article>
  );
}
function Timeline({ documents }: { documents: ArchiveDocument[] }) {
  const planes = documents
    .filter(
      (d): d is Extract<ArchiveDocument, { _type: "cognitionPlane" }> =>
        d._type === "cognitionPlane",
    )
    .sort((a, b) => a.periodStart.localeCompare(b.periodStart));
  const t0 = planes.filter((p) => p.anchorType === "T0").at(-1);
  const past = planes.find((p) => p.anchorType === "reconstructed_past");
  return (
    <>
      <PageTitle
        kicker="05 · COGNITION THROUGH TIME"
        title="看见差异，不评判高低。"
        text="T0 是注册锚点。历史平面来自具体事件的重建，只呈现记录差异与证据，不输出成长评分。"
      />
      <div className="timeline">
        {planes.map((p) => (
          <article className="timeline-item" key={p._id}>
            <span className="timeline-dot" />
            <small>
              {p.periodStart}{" "}
              {p.periodEnd !== p.periodStart ? `— ${p.periodEnd}` : ""}
            </small>
            <h2>{p.title}</h2>
            <span className="pill">
              {p.anchorType} · {p.demo ? "虚构演示" : "个人记录"}
            </span>
            <p className="source">
              {p.sourceProvenance
                .map((s) => `${s.sourceRef._ref} / ${s.strength}`)
                .join(" · ")}
            </p>
          </article>
        ))}
      </div>
      {past && t0 ? (
        <div className="panel">
          <h2>历史切片 ↔ T0 · 有据可查的差异</h2>
          <p>
            这些是不同时间与问题下的原话，不构成改善、退步或因果判断。未记录的维度不推断。
          </p>
          {Object.keys(past.fields)
            .filter((k) => {
              const key = k as keyof typeof past.fields;
              return (
                past.fields[key].state === "known" &&
                t0.fields[key].state === "known" &&
                past.fields[key].text !== t0.fields[key].text
              );
            })
            .map((k) => {
              const key = k as keyof typeof past.fields;
              return (
                <div className="plane-diff" key={key}>
                  <h3>{key}</h3>
                  <div>
                    <span>{past.periodStart}</span>
                    <p>{past.fields[key].text}</p>
                    <Source answer={past.fields[key]} />
                  </div>
                  <div>
                    <span>T0 · {t0.periodStart}</span>
                    <p>{t0.fields[key].text}</p>
                    <Source answer={t0.fields[key]} />
                  </div>
                </div>
              );
            })}
          <details>
            <summary>保留的未知维度（不评分）</summary>
            <p>{past.unknownFields.join(" · ")}</p>
          </details>
        </div>
      ) : (
        <div className="panel">
          尚无可比较的两个认知平面。演示档案包含一个 T0
          与一个历史平面；个人平面不会混用演示证据。
        </div>
      )}
    </>
  );
}
