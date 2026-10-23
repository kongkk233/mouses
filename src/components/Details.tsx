import { consistencyWarnings } from "../../shared/genetics";
import { useState } from "react";
import {
  ArrowRight,
  Baby,
  CalendarDays,
  ChevronRight,
  Dices,
  Edit3,
  Heart,
  House,
  LockKeyhole,
  Mouse as MouseIcon,
  Network,
  NotebookPen,
  Plus,
  Sprout,
} from "lucide-react";
import { useApp } from "../context";
import { Badge, Empty, History, MouseRow } from "./Primitives";
import { CageScene, MouseSprite } from "./MouseSprite";
import {
  actionable,
  cageMembers,
  currentOccurrence,
  eventsFor,
  mouseTags,
} from "../selectors";
import { ageText, daysBetween, shortDate } from "../../shared/dates";
import { purposeLabel, sexLabel, statusLabel } from "../../shared/types";
import type { Breeding, Mouse, Litter } from "../../shared/types";
import { coatLabels } from "../../shared/appearance";

export function CageDetail({ id }: { id: string }) {
  const { state, open } = useApp(),
    cage = state.cages.find((c) => c.id === id)!;
  const members = cageMembers(state, id),
    o = currentOccurrence(state, id),
    [tab, setTab] = useState("members");
  const mixed =
    cage.purpose !== "breeding" &&
    members.some((m) => m.sex === "male") &&
    members.some((m) => m.sex === "female");
  return (
    <>
      <div className="detail-intro">
        <div>
          <span className="eyebrow">{purposeLabel[cage.purpose]}</span>
          <h1>
            {cage.code}
            <span>{cage.nickname}</span>
          </h1>
        </div>
        <button
          className="icon-button"
          aria-label="编辑笼位"
          onClick={() => open({ kind: "cageForm", id })}
        >
          <Edit3 size={18} />
        </button>
      </div>
      <div className="detail-scene">
        <CageScene cage={cage} large />
      </div>
      <div className="detail-stats">
        <div>
          <span>在笼 / 容量</span>
          <strong>
            {members.length} / {cage.capacity}
          </strong>
        </div>
        <div>
          <span>最近换笼</span>
          <strong>{shortDate(cage.lastCleanedOn)}</strong>
        </div>
        <div>
          <span>下次换笼</span>
          <strong>
            {cage.plan?.paused ? "已暂停" : shortDate(o?.scheduledOn)}
          </strong>
        </div>
      </div>
      {members.length > cage.capacity && (
        <div className="form-callout amber">
          容量 {members.length}/{cage.capacity} · 超出{" "}
          {members.length - cage.capacity} 只
        </div>
      )}
      {mixed && (
        <div className="subtle-notice">
          本笼登记有雌雄成员，用途为非配种；请按实际情况复核。系统不会自动登记配种。
        </div>
      )}
      <div className="action-row">
        <button
          className="button primary"
          onClick={() => open({ kind: "clean", data: { cageIds: [id] } })}
        >
          <CheckIcon />
          记录换笼
        </button>
        <button
          className="button"
          onClick={() => open({ kind: "careForm", data: { cageIds: [id] } })}
        >
          <NotebookPen size={16} />
          照护记录
        </button>
        <button
          className="button"
          onClick={() =>
            open({
              kind: "transfer",
              data: { mouseIds: members.map((m) => m.id) },
            })
          }
        >
          转笼
        </button>
      </div>
      <div className="detail-tabs">
        {[
          ["members", "小窝成员"],
          ["plan", "换笼计划"],
          ["history", "照护记录"],
        ].map(([k, v]) => (
          <button
            className={tab === k ? "active" : ""}
            key={k}
            onClick={() => setTab(k)}
          >
            {v}
          </button>
        ))}
      </div>
      {tab === "members" && (
        <>
          <div className="section-title">
            <h3>一起住着的 {members.length} 位</h3>
            <span className="muted">
              未断奶{" "}
              {members.filter((m) => m.weaningStatus === "unweaned").length} ·
              已断奶{" "}
              {members.filter((m) => m.weaningStatus === "weaned").length}
            </span>
          </div>
          {members.length ? (
            members.map((m) => <MouseRow key={m.id} mouse={m} />)
          ) : (
            <Empty
              title="小窝还没有住客"
              action={
                <button
                  className="button"
                  onClick={() => open({ kind: "mouseForm" })}
                >
                  登记小鼠
                </button>
              }
            />
          )}
        </>
      )}
      {tab === "plan" && (
        <>
          <div className="section-title">
            <h3>换笼安排</h3>
            <button
              className="text-button"
              onClick={() => open({ kind: "plan", data: { cageIds: [id] } })}
            >
              {cage.plan ? "调整计划" : "设置计划"}
              <ChevronRight size={14} />
            </button>
          </div>
          {cage.plan ? (
            <div className="plan-card">
              <strong>
                每 {cage.plan.intervalDays} 天 · {cage.plan.reminderTime}
              </strong>
              <p>
                {cage.plan.paused
                  ? cage.plan.pauseReason || "计划已暂停"
                  : `按最近实际换笼日顺延，提前 ${cage.plan.aheadDays} 天提醒`}
              </p>
              {cage.plan.futureIntervalDays && (
                <p>下次完成后改为每 {cage.plan.futureIntervalDays} 天</p>
              )}
              {cage.plan.resumeOn && (
                <p>拟恢复 {cage.plan.resumeOn} · 届时复核首次计划</p>
              )}
              {o && (
                <button
                  className="button full"
                  onClick={() => open({ kind: "occurrence", id: o.id })}
                >
                  本次计划 {o.scheduledOn}
                  <ChevronRight size={15} />
                </button>
              )}
            </div>
          ) : (
            <Empty
              title="还没有换笼计划"
              text="请按实验室规则设置周期和首次日期。"
            />
          )}
          <h3 className="spaced-heading">实际换笼历史</h3>
          {state.events
            .filter(
              (e) => e.type === "cleaning.complete" && e.cageIds.includes(id),
            )
            .sort((a, b) => b.date.localeCompare(a.date))
            .map((e) => (
              <div className="record-line" key={e.id}>
                <CalendarDays size={15} />
                <strong>{e.date}</strong>
                <span>{e.voided ? "已撤销" : "实际完成"}</span>
                {!e.voided && (
                  <button
                    className="text-button"
                    onClick={() => open({ kind: "cleaningCorrect", id: e.id })}
                  >
                    更正
                  </button>
                )}
              </div>
            ))}
        </>
      )}
      {tab === "history" && <History events={eventsFor(state, id)} />}
      <div className="danger-zone">
        {!members.length && (
          <button
            className="text-button danger"
            onClick={() =>
              open({ kind: "archive", id, data: { target: "cage" } })
            }
          >
            归档这个笼位
          </button>
        )}
        {!members.length && (
          <button
            className="text-button danger"
            onClick={() =>
              open({ kind: "archive", id, data: { target: "deleteCage" } })
            }
          >
            删除误录空笼
          </button>
        )}
      </div>
    </>
  );
}
function CheckIcon() {
  return <span className="check-icon">✓</span>;
}
export function MouseDetail({ id }: { id: string }) {
  const { state, open } = useApp(),
    m = state.mice.find((m) => m.id === id)!;
  const [tab, setTab] = useState("profile");
  const cage = state.cages.find((c) => c.id === m.cageId),
    days = daysBetween(m.dob, state.today),
    active = state.breedings.filter(
      (b) =>
        (b.motherId === id || b.candidateFatherIds.includes(id)) &&
        b.status !== "ended",
    );
  const recentTransfer = eventsFor(state, id).find(
    (e) => e.type === "mouse.transfer",
  );
  return (
    <>
      <section className={`mouse-profile-hero coat-${m.appearance.coat}`}>
        <div className="profile-sparkles" aria-hidden="true">
          ✧<span>✧</span>
        </div>
        <MouseSprite mouse={m} />
        <span className="profile-genotype">{m.genotype || "待鉴定"}</span>
        <button
          className="profile-edit"
          aria-label="编辑小鼠"
          onClick={() => open({ kind: "mouseForm", id })}
        >
          <Edit3 size={17} />
        </button>
      </section>
      <div className="mouse-profile-title">
        <div>
          <h1>
            {m.code}
            <span>{m.nickname}</span>
          </h1>
          <div className="row wrap gap-8">
            <span className="sex-text">{sexLabel[m.sex]}</span>
            {mouseTags(state, m).map((t, i) => (
              <Badge key={i} tone={t.tone}>
                {t.label}
              </Badge>
            ))}
            {state.settings.personalities && m.personality && (
              <Badge tone="neutral">{m.personality}</Badge>
            )}
          </div>
        </div>
        <button
          className="cage-location"
          disabled={!cage}
          onClick={() => cage && open({ kind: "cage", id: cage.id })}
        >
          <House size={15} />
          {cage?.code || statusLabel[m.status]}
          <ChevronRight size={13} />
        </button>
      </div>
      <div className="detail-stats">
        <div>
          <span>周龄</span>
          <strong>{ageText(m.dob, state.today, m.dobEstimated)}</strong>
        </div>
        <div>
          <span>出生日期{m.dobEstimated ? "（估计）" : ""}</span>
          <strong>{m.dob}</strong>
        </div>
        <div>
          <span>日龄</span>
          <strong>
            {days}
            <small> 天</small>
          </strong>
        </div>
      </div>
      <div className="detail-tabs">
        {[
          ["profile", "基础档案"],
          ["breeding", "繁育时间轴"],
          ["family", "家庭小剧场"],
          ["history", "成长记录"],
        ].map(([k, v]) => (
          <button
            key={k}
            className={tab === k ? "active" : ""}
            onClick={() => setTab(k)}
          >
            {v}
          </button>
        ))}
      </div>
      {tab === "profile" && (
        <>
          <dl className="info-grid">
            <div>
              <dt>品系 / 背景</dt>
              <dd>{m.strain || "未登记"}</dd>
            </div>
            <div>
              <dt>基因型</dt>
              <dd>{m.genotype || "待鉴定"}</dd>
            </div>
            <div>
              <dt>断奶状态</dt>
              <dd>
                {
                  { unknown: "未记录", unweaned: "未断奶", weaned: "已断奶" }[
                    m.weaningStatus
                  ]
                }
                {m.weanedOn ? ` · ${m.weanedOn}` : ""}
              </dd>
            </div>
            <div>
              <dt>出生窝次</dt>
              <dd>
                {m.birthLitterId ? (
                  <button
                    className="text-button"
                    onClick={() =>
                      open({ kind: "litter", id: m.birthLitterId! })
                    }
                  >
                    {state.litters.find((l) => l.id === m.birthLitterId)?.code}
                    <ChevronRight size={13} />
                  </button>
                ) : (
                  "未登记"
                )}
              </dd>
            </div>
            <div>
              <dt>最近笼具更换</dt>
              <dd>{cage?.lastCleanedOn || "未登记"}</dd>
            </div>
            <div>
              <dt>最近转笼</dt>
              <dd>{recentTransfer?.date || "未登记"}</dd>
            </div>
            {m.aliases.length > 0 && (
              <div className="span-2">
                <dt>历史编号</dt>
                <dd>{m.aliases.join("、")}</dd>
              </div>
            )}
          </dl>
          <div className="section-title">
            <h3>小窝名片</h3>
            <button
              className="text-button"
              onClick={() => open({ kind: "appearance", id })}
            >
              <Dices size={15} />
              外观候选
            </button>
          </div>
          <div className="identity-card">
            <MouseSprite mouse={m} pose="groom" />
            <div>
              <strong>{coatLabels[m.appearance.coat]}</strong>
              <p>稳定身份 #{m.avatarSeed.toString(36).toUpperCase()}</p>
              <span className="muted">
                {m.appearanceLocked ? "外观已锁定" : "默认生成外观"} · 趣味呈现
              </span>
            </div>
            <LockKeyhole size={16} />
          </div>
          <details className="trait-details">
            <summary>查看外观细节与来源</summary>
            <dl className="trait-grid">
              {Object.entries({
                coat: "体色",
                pattern: "花纹",
                ears: "耳朵",
                eyes: "眼睛",
                face: "脸型",
                body: "体型",
                tail: "尾巴",
                expression: "表情",
              }).map(([k, v]) => (
                <div key={k}>
                  <dt>{v}</dt>
                  <dd>
                    {
                      (
                        {
                          solid: "纯色",
                          cap: "头顶斑",
                          socks: "白爪",
                          blaze: "额间白斑",
                          round: "圆润",
                          large: "大耳",
                          black: "黑色",
                          brown: "深棕",
                          ruby: "红色",
                          pointed: "尖脸",
                          slender: "纤细",
                          curl: "弯尾",
                          long: "长尾",
                          curious: "好奇",
                          sleepy: "困倦",
                          gentle: "温柔",
                          ...coatLabels,
                        } as any
                      )[(m.appearance as any)[k]]
                    }
                  </dd>
                  <small>{m.appearance.provenance[k]}</small>
                </div>
              ))}
            </dl>
          </details>
          {consistencyWarnings(state, m).map((warning) => (
            <p key={warning} className="subtle-notice">
              一致性提示 · {warning}
            </p>
          ))}
          <h3 className="spaced-heading">真实表型</h3>
          <p className="body-copy">
            {m.phenotype ||
              "尚未登记真实表型。装饰头像不代表实际毛色、基因型或健康状态。"}
          </p>
          {m.notes && <p className="body-copy">{m.notes}</p>}
          {m.status === "active" && (
            <div className="action-row">
              <button
                className="button primary"
                onClick={() =>
                  open({
                    kind: "careForm",
                    data: { mouseId: id, cageIds: [m.cageId] },
                  })
                }
              >
                <NotebookPen size={16} />
                登记照护
              </button>
              <button
                className="button"
                onClick={() =>
                  open({ kind: "transfer", data: { mouseIds: [id] } })
                }
              >
                转笼
              </button>
              {m.weaningStatus !== "weaned" && (
                <button
                  className="button"
                  onClick={() =>
                    open({ kind: "wean", data: { mouseIds: [id] } })
                  }
                >
                  实际断奶
                </button>
              )}
            </div>
          )}
          <div className="danger-zone">
            {m.status === "active" && (
              <button
                className="text-button danger"
                onClick={() =>
                  open({ kind: "archive", id, data: { target: "mouse" } })
                }
              >
                登记去向 / 归档
              </button>
            )}
            <button
              className="text-button danger"
              onClick={() =>
                open({ kind: "archive", id, data: { target: "deleteMouse" } })
              }
            >
              删除误录档案
            </button>
          </div>
        </>
      )}
      {tab === "breeding" && (
        <>
          <div className="section-title">
            <h3>繁育记录</h3>
            {m.sex === "female" && m.status === "active" && (
              <button
                className="button small"
                disabled={active.length > 0 || m.breedingStopped}
                onClick={() =>
                  open({ kind: "breedingForm", data: { motherId: id } })
                }
              >
                <Plus size={14} />
                登记配种
              </button>
            )}
          </div>
          {state.breedings.filter(
            (b) => b.motherId === id || b.candidateFatherIds.includes(id),
          ).length ? (
            state.breedings
              .filter(
                (b) => b.motherId === id || b.candidateFatherIds.includes(id),
              )
              .sort((a, b) => b.pairedOn.localeCompare(a.pairedOn))
              .map((b) => <BreedingTimeline key={b.id} breeding={b} />)
          ) : (
            <Empty
              title="繁育的故事，还未开始"
              text="也可以直接登记已经发生的产仔，无需补造前序配种。"
            />
          )}
          <div className="section-title">
            <h3>窝次与哺育</h3>
            <button
              className="text-button"
              onClick={() =>
                open({
                  kind: "litterForm",
                  data: m.sex === "female" ? { motherId: id } : {},
                })
              }
            >
              登记一窝
              <Plus size={14} />
            </button>
          </div>
          {state.litters
            .filter(
              (l) =>
                l.motherId === id ||
                l.fatherId === id ||
                l.fosterMotherId === id,
            )
            .map((l) => (
              <LitterCard key={l.id} litter={l} />
            ))}
          {m.sex === "female" && (
            <button
              className="text-button"
              onClick={() => open({ kind: "breedingStop", id })}
            >
              {m.breedingStopped ? "恢复繁殖资格" : "记录停止繁殖"}
            </button>
          )}
        </>
      )}
      {tab === "family" && <Family mouse={m} />}
      {tab === "history" && (
        <>
          <div className="section-title">
            <h3>每一次被记住的日常</h3>
            {m.cageId && (
              <button
                className="text-button"
                onClick={() =>
                  open({
                    kind: "careForm",
                    data: {
                      mouseId: id,
                      cageIds: [m.cageId],
                      kind: "milestone",
                      litterId: m.birthLitterId,
                    },
                  })
                }
              >
                记录成长
                <Plus size={14} />
              </button>
            )}
          </div>
          <History events={eventsFor(state, id)} />
        </>
      )}
    </>
  );
}
export function BreedingTimeline({ breeding: b }: { breeding: Breeding }) {
  const { state, open } = useApp(),
    mother = state.mice.find((m) => m.id === b.motherId)!;
  const events = eventsFor(state, b.id)
    .filter((e) => !e.voided)
    .sort(
      (a, b) =>
        a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt),
    );
  const day = b.baselineDate
    ? daysBetween(b.baselineDate, state.today) + b.baselineValue
    : null;
  return (
    <section className="breeding-card">
      <header>
        <span>
          <Heart size={16} />
          <strong>{mother.code} 的繁育时间轴</strong>
        </span>
        <Badge
          tone={
            b.status === "confirmed"
              ? "gold"
              : b.status === "ended"
                ? "sage"
                : "pink"
          }
        >
          {
            {
              paired: "已配对",
              observing: "等待确认",
              confirmed: "妊娠已确认",
              ended: "已结束",
            }[b.status]
          }
        </Badge>
      </header>
      <div className="breeding-meta">
        配对 {b.pairedOn} · 候选爸爸{" "}
        {b.candidateFatherIds
          .map((id) => state.mice.find((m) => m.id === id)?.code)
          .join("、") || "未登记"}
      </div>
      <ol className="breeding-timeline">
        {events.map((e) => (
          <li key={e.id}>
            <span className="timeline-dot" />
            <time>{e.date}</time>
            <strong>{e.title.replace(`${mother.code} · `, "")}</strong>
            <small>
              {e.notes || "用户登记"} ·{" "}
              {e.details.confidence === "observation"
                ? "观察 / 待确认"
                : e.details.confidence === "confirmed"
                  ? "人工确认"
                  : "登记事实"}
            </small>
          </li>
        ))}
        {b.dueFrom && (
          <li className="prediction">
            <span className="timeline-dot" />
            <time>
              {b.dueFrom} — {b.dueTo}
            </time>
            <strong>预计产仔窗口</strong>
            <small>人工填写 · 预测，尚未登记实际产仔</small>
          </li>
        )}
      </ol>
      {b.status !== "ended" && (
        <>
          <div className="pregnancy-basis">
            <span>
              {day !== null
                ? `估计孕日 ${day} · ${b.convention || "按登记基准"}`
                : "孕日未登记"}
            </span>
            {b.reviewOn && <span>复核 {shortDate(b.reviewOn)}</span>}
          </div>
          <div className="action-row compact">
            <button
              className="button small"
              onClick={() =>
                open({
                  kind: "breedingUpdate",
                  id: b.id,
                  data: { action: "observe" },
                })
              }
            >
              登记观察
            </button>
            {b.status !== "confirmed" && (
              <button
                className="button small"
                onClick={() =>
                  open({
                    kind: "breedingUpdate",
                    id: b.id,
                    data: { action: "confirm" },
                  })
                }
              >
                人工确认妊娠
              </button>
            )}
            <button
              className="button small"
              onClick={() =>
                open({
                  kind: "litterForm",
                  data: { motherId: b.motherId, breedingId: b.id },
                })
              }
            >
              登记产仔
            </button>
            <button
              className="text-button"
              onClick={() =>
                open({
                  kind: "breedingUpdate",
                  id: b.id,
                  data: { action: "plan" },
                })
              }
            >
              计划与依据
            </button>
            <button
              className="text-button muted"
              onClick={() =>
                open({
                  kind: "breedingUpdate",
                  id: b.id,
                  data: { action: "end" },
                })
              }
            >
              结束过程
            </button>
          </div>
        </>
      )}
    </section>
  );
}
export function LitterCard({ litter: l }: { litter: Litter }) {
  const { state, open } = useApp(),
    babies = state.mice.filter((m) => m.birthLitterId === l.id),
    alive = babies.filter((m) => m.status === "active"),
    weaned = babies.filter((m) => m.weaningStatus === "weaned");
  return (
    <button
      className="litter-card"
      onClick={() => open({ kind: "litter", id: l.id })}
    >
      <div className="litter-portraits">
        {babies.slice(0, 3).map((m) => (
          <MouseSprite mouse={m} key={m.id} />
        ))}
      </div>
      <div>
        <strong>
          {l.code}
          <Badge tone={l.nursing ? "sage" : "muted"}>
            {l.nursing ? "哺乳中" : "哺育已结束"}
          </Badge>
        </strong>
        <span>
          {l.bornOn} · 当前 {alive.length} 只 · 历史总数 {l.birthTotal} 只
        </span>
        <small>
          断奶 {weaned.length} / {babies.length}
        </small>
      </div>
      <ChevronRight size={17} />
    </button>
  );
}
function FamilyNode({
  mouse,
  label,
  candidate = false,
}: {
  mouse?: Mouse;
  label: string;
  candidate?: boolean;
}) {
  const { state, open } = useApp();
  return mouse ? (
    <button
      className={`family-node ${candidate ? "candidate" : ""}`}
      onClick={() => open({ kind: "mouse", id: mouse.id })}
    >
      <span className="family-role">
        {label}
        {candidate ? " · 候选" : ""}
      </span>
      <MouseSprite mouse={mouse} />
      <strong>
        {mouse.code}
        <small>{mouse.nickname}</small>
      </strong>
      <span>
        {mouse.genotype || "待鉴定"} ·{" "}
        {state.cages.find((c) => c.id === mouse.cageId)?.code || "已归档"}
      </span>
    </button>
  ) : (
    <div className="family-node unknown">
      <span className="family-role">{label}</span>
      <span className="unknown-parent">?</span>
      <strong>尚未登记</strong>
      <span>未知保留未知</span>
    </div>
  );
}
export function Family({ mouse: m }: { mouse: Mouse }) {
  const { state } = useApp(),
    [tree, setTree] = useState(false),
    mother = state.mice.find((x) => x.id === m.motherId),
    father = state.mice.find((x) => x.id === m.fatherId),
    siblings = state.mice.filter(
      (x) =>
        x.id !== m.id && m.birthLitterId && x.birthLitterId === m.birthLitterId,
    ),
    children = state.litters.filter(
      (l) => l.motherId === m.id || l.fatherId === m.id,
    ),
    foster = state.mice.find((x) => x.id === m.fosterMotherId);
  return (
    <section className={`family-theater ${tree ? "tree-mode" : ""}`}>
      <div className="section-title">
        <h3>{tree ? "局部族谱" : "属于它的小小一家"}</h3>
        <div className="segmented">
          <button
            className={!tree ? "active" : ""}
            onClick={() => setTree(false)}
          >
            <Heart size={13} />
            小剧场
          </button>
          <button
            className={tree ? "active" : ""}
            onClick={() => setTree(true)}
          >
            <Network size={13} />
            族谱
          </button>
        </div>
      </div>
      <div className="family-parents">
        <FamilyNode
          mouse={mother}
          label="妈妈"
          candidate={m.motherStatus === "candidate"}
        />
        <FamilyNode
          mouse={father}
          label="爸爸"
          candidate={m.fatherStatus === "candidate"}
        />
      </div>
      <div className="family-connectors">
        <span
          className={
            m.motherStatus === "candidate" || !mother ? "candidate" : ""
          }
        />
        <span
          className={
            m.fatherStatus === "candidate" || !father ? "candidate" : ""
          }
        />
        <i aria-hidden="true" />
      </div>
      <div className="family-center">
        <FamilyNode mouse={m} label="这位小主角" />
      </div>
      {foster && (
        <div className="foster-connection">
          <Badge tone="lilac">照顾过 · 寄养关系</Badge>
          <FamilyNode mouse={foster} label="寄养母" />
        </div>
      )}
      {siblings.length > 0 && (
        <details className="sibling-details" open={!tree}>
          <summary>同窝兄弟姐妹 · {siblings.length} 只</summary>
          <div className="family-siblings">
            {siblings.map((s) => (
              <FamilyNode
                key={s.id}
                mouse={s}
                label={
                  state.cages.find((c) => c.id === s.cageId)?.code || "已归档"
                }
              />
            ))}
          </div>
        </details>
      )}
      <div className="section-title">
        <h3>子代窝次</h3>
        <span className="muted">{children.length} 窝</span>
      </div>
      {children.length ? (
        children.map((l) => <LitterCard key={l.id} litter={l} />)
      ) : (
        <div className="family-no-children">
          <Sprout size={20} />
          尚未登记子代
        </div>
      )}
      <p className="field-note">
        关系来自档案，跨笼和归档不切断家系。候选关系使用虚线。
      </p>
    </section>
  );
}
export function LitterDetail({ id }: { id: string }) {
  const { state, open } = useApp(),
    l = state.litters.find((l) => l.id === id)!,
    babies = state.mice.filter((m) => m.birthLitterId === id),
    weaned = babies.filter((m) => m.weaningStatus === "weaned"),
    alive = babies.filter((m) => m.status === "active"),
    mother = state.mice.find((m) => m.id === l.motherId),
    father = state.mice.find((m) => m.id === l.fatherId),
    foster = state.mice.find((m) => m.id === l.fosterMotherId);
  return (
    <>
      <div className="litter-detail-hero">
        <span className="eyebrow">A LITTLE FAMILY</span>
        <h1>{l.code}</h1>
        <p>
          出生于 {l.bornOn}
          {l.dobEstimated ? "（估计）" : ""} ·{" "}
          {daysBetween(l.bornOn, state.today)} 日龄
        </p>
        <div>
          {babies.slice(0, 6).map((m) => (
            <button
              key={m.id}
              onClick={() => open({ kind: "mouse", id: m.id })}
              aria-label={m.code}
            >
              <MouseSprite
                mouse={m}
                pose={m.weaningStatus === "unweaned" ? "baby" : "idle"}
              />
            </button>
          ))}
        </div>
      </div>
      <div className="detail-stats">
        <div>
          <span>当前在笼</span>
          <strong>
            {alive.length}
            <small> 只</small>
          </strong>
        </div>
        <div>
          <span>历史出生总数</span>
          <strong>
            {l.birthTotal}
            <small> 只</small>
          </strong>
        </div>
        <div>
          <span>已断奶</span>
          <strong>
            {weaned.length} / {babies.length}
          </strong>
        </div>
      </div>
      <div className="parents-inline">
        {[
          [mother, "妈妈"],
          [father, l.fatherStatus === "candidate" ? "候选爸爸" : "爸爸"],
          [foster, "寄养母"],
        ].map(([m, label]: any) => (
          <button
            key={label}
            disabled={!m}
            onClick={() => open({ kind: "mouse", id: m.id })}
          >
            <span>{label}</span>
            <strong>{m?.code || "未登记"}</strong>
            {m && <ChevronRight size={12} />}
          </button>
        ))}
      </div>
      <div className="nursing-status">
        <Badge tone={l.nursing ? "sage" : "muted"}>
          {l.nursing ? "实际哺乳中" : "哺育已结束"}
        </Badge>
        {l.weanDueOn && <span>计划断奶 {l.weanDueOn}</span>}
        <button
          className="text-button"
          onClick={() => open({ kind: "litterEdit", id })}
        >
          更正窝次
          <Edit3 size={13} />
        </button>
      </div>
      <div className="action-row">
        <button
          className="button primary"
          disabled={!alive.some((m) => m.weaningStatus !== "weaned")}
          onClick={() =>
            open({
              kind: "wean",
              data: {
                litterId: id,
                mouseIds: alive
                  .filter((m) => m.weaningStatus !== "weaned")
                  .map((m) => m.id),
              },
            })
          }
        >
          分批登记断奶
        </button>
        <button
          className="button"
          onClick={() =>
            open({
              kind: "careForm",
              data: { cageIds: [l.cageId], kind: "milestone", litterId: id },
            })
          }
        >
          记录成长节点
        </button>
      </div>
      <h3 className="spaced-heading">这一窝的 {babies.length} 位小住客</h3>
      {babies.map((m) => (
        <MouseRow key={m.id} mouse={m} />
      ))}
      {l.differenceNote && (
        <p className="subtle-notice">历史数量差额：{l.differenceNote}</p>
      )}
      <h3 className="spaced-heading">成长与记录</h3>
      <History events={eventsFor(state, id)} />
    </>
  );
}
