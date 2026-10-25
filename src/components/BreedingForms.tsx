import { useState } from "react";
import { Dices, Heart, Info, Check } from "lucide-react";
import { useApp } from "../context";
import {
  Field,
  FormShell,
  MouseSelect,
  CageSelect,
  CapacityPreview,
  Badge,
} from "./Primitives";
import { MouseSprite } from "./MouseSprite";
import { litterAppearance, coatLabels } from "../../shared/appearance";
import { addDays, daysBetween } from "../../shared/dates";
import { MIN_BIRTH_DATE, EARLY_WEAN_DAYS } from "../../shared/validation";

function lineage(
  state: ReturnType<typeof useApp>["state"],
  id: string,
  visited = new Set<string>(),
): Set<string> {
  if (visited.has(id)) return visited;
  visited.add(id);
  const m = state.mice.find((m) => m.id === id);
  if (m?.motherId && m.motherStatus === "confirmed")
    lineage(state, m.motherId, visited);
  if (m?.fatherId && m.fatherStatus === "confirmed")
    lineage(state, m.fatherId, visited);
  return visited;
}
export function BreedingForm({ data = {} }: { data?: Record<string, any> }) {
  const { state } = useApp(),
    [motherId, setMother] = useState(data.motherId || ""),
    [fathers, setFathers] = useState<string[]>([]),
    [on, setOn] = useState(state.today),
    [review, setReview] = useState(""),
    [notes, setNotes] = useState(""),
    [ack, setAck] = useState(false);
  const mother = state.mice.find((m) => m.id === motherId),
    common = mother
      ? [
          ...new Set(
            fathers.flatMap((id) =>
              [...lineage(state, id)].filter((a) =>
                lineage(state, mother.id).has(a),
              ),
            ),
          ),
        ]
      : [];
  const separate =
    mother &&
    fathers.some(
      (id) => state.mice.find((m) => m.id === id)?.cageId !== mother.cageId,
    );
  return (
    <FormShell
      title="登记配种"
      type="breeding.create"
      payload={() => ({
        motherId,
        candidateFatherIds: fathers,
        date: on,
        reviewOn: review,
        notes,
        kinshipAcknowledged: ack,
      })}
      disabled={!motherId || (!!common.length && !ack)}
    >
      <Field label="母鼠 *">
        <MouseSelect
          name="motherId"
          value={motherId}
          onChange={(v) => {
            setMother(v);
            setAck(false);
          }}
          sex="female"
        />
      </Field>
      <Field label="候选父鼠（可多选或未知）">
        <div className="check-list">
          {state.mice
            .filter((m) => m.sex === "male" && m.status === "active")
            .map((m) => (
              <label key={m.id} className="checkbox-label">
                <input
                  type="checkbox"
                  checked={fathers.includes(m.id)}
                  onChange={(e) => {
                    setFathers((v) =>
                      e.target.checked
                        ? [...v, m.id]
                        : v.filter((id) => id !== m.id),
                    );
                    setAck(false);
                  }}
                />
                <strong>{m.code}</strong>
                <span>{m.nickname}</span>
                <Badge>
                  {state.cages.find((c) => c.id === m.cageId)?.code}
                </Badge>
              </label>
            ))}
        </div>
      </Field>
      <div className="form-grid">
        <Field label="配种开始日期 *">
          <input
            name="date"
            type="date"
            max={state.today}
            value={on}
            onChange={(e) => setOn(e.target.value)}
            required
          />
        </Field>
        <Field label="计划复核日期（可选）">
          <input
            type="date"
            value={review}
            onChange={(e) => setReview(e.target.value)}
          />
        </Field>
      </div>
      {separate && (
        <div className="form-callout amber">
          <Info size={18} />
          <span>
            所选个体不在同笼。配种登记不改变笼位，请按实际情况另行记录转笼。
          </span>
        </div>
      )}
      {common.length > 0 && (
        <div className="kinship-warning">
          <strong>已登记家系存在共同祖先</strong>
          <p>
            {common
              .map((id) => state.mice.find((m) => m.id === id)?.code)
              .join("、")}
          </p>
          <label className="checkbox-label">
            <input
              name="kinshipAcknowledged"
              type="checkbox"
              checked={ack}
              onChange={(e) => setAck(e.target.checked)}
            />
            已复核，继续如实记录本次配种
          </label>
        </div>
      )}
      <Field label="备注">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
      <p className="field-note">
        配种对象保持候选身份，登记产仔时再确认父母信息。
      </p>
    </FormShell>
  );
}
export function BreedingUpdateForm({
  id,
  data = {},
}: {
  id: string;
  data?: Record<string, any>;
}) {
  const { state } = useApp(),
    b = state.breedings.find((b) => b.id === id)!;
  const action = data.action || "observe";
  const [on, setOn] = useState(state.today),
    [evidence, setEvidence] = useState(""),
    [outcome, setOutcome] = useState(""),
    [baseline, setBaseline] = useState(b.baselineDate || ""),
    [value, setValue] = useState(String(b.baselineValue)),
    [convention, setConvention] = useState(b.convention),
    [from, setFrom] = useState(b.dueFrom || ""),
    [to, setTo] = useState(b.dueTo || ""),
    [review, setReview] = useState(b.reviewOn || "");
  return (
    <FormShell
      title="繁育节点"
      type="breeding.update"
      payload={() => ({
        id,
        action,
        date: on,
        evidence,
        outcome,
        baselineDate: baseline,
        baselineValue: value,
        convention,
        dueFrom: from,
        dueTo: to,
        reviewOn: review,
      })}
    >
      <Field label="登记日期 *">
        <input
          type="date"
          name="date"
          min={b.pairedOn}
          max={state.today}
          value={on}
          onChange={(e) => setOn(e.target.value)}
          required
        />
      </Field>
      {action === "observe" && (
        <div className="form-callout">
          <Info size={18} />
          <span>见栓与其他观察只进入待确认，妊娠结果需独立人工确认。</span>
        </div>
      )}
      {["observe", "confirm"].includes(action) && (
        <Field
          label={action === "confirm" ? "人工确认依据 *" : "实际观察与依据 *"}
        >
          <textarea
            name="evidence"
            required
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder={
              action === "confirm"
                ? "记录确认方式、来源与复核信息"
                : "例如：见栓日期与观察描述"
            }
          />
        </Field>
      )}
      {action === "end" && (
        <Field label="实际结果 *">
          <select
            name="outcome"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
            required
          >
            <option value="">选择结果</option>
            {["未孕", "妊娠中止", "取消", "未知结果", "过程结束"].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </Field>
      )}
      {action !== "end" && (
        <>
          <details className="more-info" open={action === "plan"}>
            <summary>复核计划与孕日依据（可选）</summary>
            <div className="form-grid">
              <Field label="复核日期" wide>
                <input
                  type="date"
                  value={review}
                  onChange={(e) => setReview(e.target.value)}
                />
              </Field>
              <Field label="计时基准日期">
                <input
                  name="baselineDate"
                  type="date"
                  max={state.today}
                  value={baseline}
                  onChange={(e) => setBaseline(e.target.value)}
                />
              </Field>
              <Field label="基准日计时值">
                <input
                  name="baselineValue"
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                />
              </Field>
              <Field label="计时约定与依据" wide>
                <input
                  name="convention"
                  value={convention}
                  onChange={(e) => setConvention(e.target.value)}
                  placeholder="如：实验室见栓日记 E0.5"
                />
              </Field>
              <Field label="人工预计产仔 · 起">
                <input
                  name="dueFrom"
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </Field>
              <Field label="人工预计产仔 · 止">
                <input
                  name="dueTo"
                  type="date"
                  min={from}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </Field>
            </div>
            <p className="field-note">
              没有计时基准时不显示精确孕日。预计日期不会自动生成产仔事实。
            </p>
          </details>
        </>
      )}
    </FormShell>
  );
}
export function LitterForm({ data = {} }: { data?: Record<string, any> }) {
  const { state, back, open } = useApp(),
    b = state.breedings.find((b) => b.id === data.breedingId),
    mother = state.mice.find((m) => m.id === (data.motherId || b?.motherId));
  const [form, setForm] = useState({
      code: `L${String(Math.max(0, ...state.litters.map((l) => (/^L\d+$/.test(l.code) ? Number(l.code.slice(1)) : 0))) + 1).padStart(3, "0")}`,
      bornOn: state.today,
      bornAlive: 3,
      birthTotal: 3,
      differenceNote: "",
      cageId: mother?.cageId || state.cages.find((c) => !c.archived)?.id || "",
      motherId: mother?.id || "",
      fatherId: "",
      fatherStatus: "confirmed",
      fosterMotherId: "",
      nursing: !!mother,
      weanDueOn: "",
      notes: "",
      capacityReason: "",
      dobEstimated: false,
      weaningStatus: "unweaned",
      exceptionReason: "",
    }),
    [seed, setSeed] = useState(Math.floor(Math.random() * 2 ** 30)),
    [choice, setChoice] = useState(0),
    [confirmed, setConfirmed] = useState(false);
  const set = (k: string, v: unknown) => {
    setForm((f) => ({ ...f, [k]: v }));
    if (["motherId", "fatherId", "fatherStatus", "bornAlive"].includes(k))
      setConfirmed(false);
  };
  const mom = state.mice.find((m) => m.id === form.motherId),
    dad =
      form.fatherStatus === "confirmed"
        ? state.mice.find((m) => m.id === form.fatherId)
        : undefined;
  const count = Math.max(0, Math.min(100, Number(form.bornAlive) || 0));
  return (
    <FormShell
      title="登记一窝"
      type="litter.create"
      payload={() => ({
        ...form,
        breedingId: data.breedingId,
        appearanceChoice: choice,
        appearanceConfirmed: confirmed || count === 0,
        avatarSeed: seed,
        candidateFatherIds: b?.candidateFatherIds || [],
        endBreeding: true,
      })}
      disabled={count > 0 && !confirmed}
      submitLabel={`登记窝次${count ? `与 ${count} 只幼鼠` : ""}`}
      after={(r) => {
        back();
        open({ kind: "litter", id: r.id });
      }}
    >
      <div className="form-grid">
        <Field label="窝号 *">
          <input
            name="code"
            maxLength={59}
            required
            value={form.code}
            onChange={(e) => set("code", e.target.value)}
          />
        </Field>
        <Field label="实际出生日期 *">
          <input
            name="bornOn"
            type="date"
            min={MIN_BIRTH_DATE}
            max={state.today}
            required
            value={form.bornOn}
            onChange={(e) => set("bornOn", e.target.value)}
          />
        </Field>
        <Field label="当前活体幼鼠数 *">
          <input
            name="bornAlive"
            type="number"
            min="0"
            max="100"
            required
            value={form.bornAlive}
            onChange={(e) => {
              set("bornAlive", e.target.value);
              if (Number(form.birthTotal) < Number(e.target.value))
                set("birthTotal", e.target.value);
            }}
          />
        </Field>
        <Field label="历史出生总数">
          <input
            name="birthTotal"
            type="number"
            min={count}
            max="200"
            value={form.birthTotal}
            onChange={(e) => set("birthTotal", e.target.value)}
          />
        </Field>
        {Number(form.birthTotal) !== count && (
          <Field label="历史差额说明 *" wide>
            <input
              name="differenceNote"
              required
              value={form.differenceNote}
              onChange={(e) => set("differenceNote", e.target.value)}
            />
          </Field>
        )}
        <Field label="当前笼位 *" wide>
          <CageSelect value={form.cageId} onChange={(v) => set("cageId", v)} />
        </Field>
        <Field label="生物学妈妈">
          <MouseSelect
            name="motherId"
            value={form.motherId}
            onChange={(v) => set("motherId", v)}
            sex="female"
            bornBefore={form.bornOn}
            allowArchived
          />
        </Field>
        <Field label="生物学爸爸 / 候选">
          <MouseSelect
            name="fatherId"
            value={form.fatherId}
            onChange={(v) => set("fatherId", v)}
            sex="male"
            bornBefore={form.bornOn}
            allowArchived
          />
        </Field>
        <Field label="父亲关系">
          <select
            value={form.fatherStatus}
            onChange={(e) => set("fatherStatus", e.target.value)}
          >
            <option value="confirmed">人工确认父亲</option>
            <option value="candidate">候选，尚未确认</option>
          </select>
        </Field>
        <Field label="实际寄养母（若有）">
          <MouseSelect
            name="fosterMotherId"
            bornBefore={form.bornOn}
            value={form.fosterMotherId}
            onChange={(v) => set("fosterMotherId", v)}
            sex="female"
            allowArchived
          />
        </Field>
        <Field label="断奶计划日期（可选）">
          <input
            type="date"
            value={form.weanDueOn}
            onChange={(e) => set("weanDueOn", e.target.value)}
          />
        </Field>
        <Field label="当前断奶状态">
          <select
            value={form.weaningStatus}
            onChange={(e) => set("weaningStatus", e.target.value)}
          >
            <option value="unweaned">未断奶</option>
            <option value="weaned">已断奶（补录历史）</option>
            <option value="unknown">未记录</option>
          </select>
        </Field>
      </div>
      {count > 0 &&
        form.weaningStatus === "weaned" &&
        daysBetween(form.bornOn, state.today) < EARLY_WEAN_DAYS && (
          <Field label={`低于 ${EARLY_WEAN_DAYS} 日龄断奶的特殊处理原因 *`}>
            <textarea
              name="exceptionReason"
              value={form.exceptionReason}
              onChange={(e) => set("exceptionReason", e.target.value)}
              required
            />
          </Field>
        )}
      <div className="row wrap gap-16">
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.nursing}
            onChange={(e) => set("nursing", e.target.checked)}
          />
          实际哺乳中
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={form.dobEstimated}
            onChange={(e) => set("dobEstimated", e.target.checked)}
          />
          出生日期为估计
        </label>
      </div>
      {count > 0 && (
        <section className="litter-candidates">
          <div className="section-title">
            <h3>给这一家选套小窝形象</h3>
            <button
              type="button"
              className="icon-button"
              aria-label="重新生成外观候选"
              onClick={() => {
                setSeed(Math.floor(Math.random() * 2 ** 30));
                setConfirmed(false);
              }}
            >
              <Dices size={17} />
            </button>
          </div>
          <div className="candidate-grid">
            {[0, 1, 2].map((option) => {
              const a = litterAppearance(
                seed,
                0,
                mom?.appearance,
                dad?.appearance,
                option,
              );
              return (
                <button
                  type="button"
                  key={option}
                  className={`appearance-candidate ${choice === option ? "selected" : ""}`}
                  onClick={() => {
                    setChoice(option);
                    setConfirmed(false);
                  }}
                >
                  <span className="candidate-babies">
                    {[0, 1].map((i) => (
                      <MouseSprite
                        key={i}
                        appearance={litterAppearance(
                          seed,
                          i,
                          mom?.appearance,
                          dad?.appearance,
                          option,
                        )}
                        pose="baby"
                      />
                    ))}
                  </span>
                  <strong>{coatLabels[a.coat]}</strong>
                  <small>
                    {option === 0 && mom
                      ? "妈妈相似"
                      : option === 1 && dad
                        ? "爸爸相似"
                        : "随机生成 / 待确认"}
                  </small>
                  {choice === option && <Check size={15} />}
                </button>
              );
            })}
          </div>
          <p className="field-note">
            亲本相似只是装饰，真实毛色与基因型另行记录。
          </p>
          <label className="checkbox-label confirmation">
            <input
              name="appearanceConfirmed"
              type="checkbox"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            确认这套候选，保存后锁定每只幼鼠的外观
          </label>
        </section>
      )}
      <CapacityPreview
        cageId={form.cageId}
        adding={count}
        reason={form.capacityReason}
        onReason={(v) => set("capacityReason", v)}
      />
      <div className="preview-box">
        <strong>将创建 {count} 份稳定个体档案</strong>
        <p className="code-preview">
          {Array.from(
            { length: Math.min(count, 12) },
            (_, i) => `${form.code}-P${String(i + 1).padStart(2, "0")}`,
          ).join("、")}
          {count > 12 ? "…" : ""}
        </p>
        {b && <p>保存后结束本次繁殖过程，哺育状态独立保留。</p>}
      </div>
      <Field label="备注">
        <textarea
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </Field>
    </FormShell>
  );
}
export function LitterEdit({ id }: { id: string }) {
  const { state } = useApp(),
    l = state.litters.find((l) => l.id === id)!;
  const [on, setOn] = useState(l.bornOn),
    [mother, setMother] = useState(l.motherId || ""),
    [foster, setFoster] = useState(l.fosterMotherId || ""),
    [nursing, setNursing] = useState(l.nursing),
    [weanDueOn, setWeanDueOn] = useState(l.weanDueOn || ""),
    [reason, setReason] = useState(""),
    [exceptionReason, setExceptionReason] = useState("");
  const earlyWeaned =
    on !== l.bornOn &&
    state.mice.some(
      (m) =>
        m.birthLitterId === id &&
        m.weaningStatus === "weaned" &&
        daysBetween(on, m.weanedOn || state.today) < EARLY_WEAN_DAYS,
    );
  return (
    <FormShell
      title="更正窝次"
      type="litter.update"
      payload={() => ({
        id,
        bornOn: on,
        motherId: mother,
        fosterMotherId: foster,
        nursing,
        weanDueOn,
        reason,
        exceptionReason,
        date: state.today,
      })}
    >
      <div className="form-callout">
        <Info size={18} />
        <span>
          出生日期、妈妈和寄养关系会整体更新本窝幼鼠，稳定 ID 与外观保持不变。
        </span>
      </div>
      <Field label="实际出生日期">
        <input
          name="bornOn"
          type="date"
          min={MIN_BIRTH_DATE}
          max={state.today}
          value={on}
          onChange={(e) => setOn(e.target.value)}
          required
        />
      </Field>
      {earlyWeaned && (
        <Field
          label={`更正后断奶日龄低于 ${EARLY_WEAN_DAYS} 天，特殊处理原因 *`}
        >
          <textarea
            name="exceptionReason"
            value={exceptionReason}
            onChange={(e) => setExceptionReason(e.target.value)}
            required
          />
        </Field>
      )}
      <Field label="生物学妈妈">
        <MouseSelect
          name="motherId"
          value={mother}
          onChange={setMother}
          sex="female"
          allowArchived
        />
      </Field>
      <Field label="寄养母">
        <MouseSelect
          name="fosterMotherId"
          value={foster}
          onChange={setFoster}
          sex="female"
          allowArchived
        />
      </Field>
      <Field label="计划断奶日期">
        <input
          type="date"
          value={weanDueOn}
          onChange={(e) => setWeanDueOn(e.target.value)}
        />
      </Field>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={nursing}
          onChange={(e) => setNursing(e.target.checked)}
        />
        实际哺乳中
      </label>
      <Field label="更正原因 *">
        <textarea
          name="reason"
          required
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </Field>
      <div className="preview-box">
        影响个体：
        {state.mice
          .filter((m) => m.birthLitterId === id)
          .map((m) => m.code)
          .join("、") || "无当前个体"}
      </div>
    </FormShell>
  );
}
