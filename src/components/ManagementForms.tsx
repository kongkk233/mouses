import { useState } from "react";
import { Dices, LockKeyhole, ArrowRight, Check, Info } from "lucide-react";
import { useApp } from "../context";
import {
  Field,
  FormShell,
  CageSelect,
  MouseSelect,
  CapacityPreview,
  Badge,
} from "./Primitives";
import { MouseSprite } from "./MouseSprite";
import { appearanceFor, coatLabels, coats } from "../../shared/appearance";
import { addDays, shortDate } from "../../shared/dates";
import { cageMembers, currentOccurrence } from "../selectors";
import { purposeLabel, sexLabel, careLabel } from "../../shared/types";
import type { Appearance } from "../../shared/types";

export function MouseForm({ id }: { id?: string }) {
  const { state, back, open } = useApp(),
    mouse = state.mice.find((m) => m.id === id),
    next =
      Math.max(
        0,
        ...state.mice.map((m) =>
          /^M\d+$/.test(m.code) ? Number(m.code.slice(1)) : 0,
        ),
      ) + 1;
  const [form, setForm] = useState({
    code: mouse?.code || `M${String(next).padStart(3, "0")}`,
    nickname: mouse?.nickname || "",
    genotype: mouse?.genotype || "",
    strain: mouse?.strain || "",
    dob: mouse?.dob || state.today,
    dobEstimated: mouse?.dobEstimated || false,
    sex: mouse?.sex || "unknown",
    cageId: mouse?.cageId || state.cages.find((c) => !c.archived)?.id || "",
    motherId: mouse?.motherId || "",
    fatherId: mouse?.fatherId || "",
    fatherStatus: mouse?.fatherStatus || "confirmed",
    motherStatus: mouse?.motherStatus || "confirmed",
    fosterMotherId: mouse?.fosterMotherId || "",
    weaningStatus: mouse?.weaningStatus || "unknown",
    weanedOn: mouse?.weanedOn || "",
    phenotype: mouse?.phenotype || "",
    notes: mouse?.notes || "",
    personality: mouse?.personality || "",
    reason: "",
    capacityReason: "",
  });
  const [seed, setSeed] = useState(
      mouse?.avatarSeed || Math.floor(Math.random() * 2 ** 30),
    ),
    [appearance, setAppearance] = useState<Appearance>(
      mouse?.appearance || appearanceFor(seed),
    );
  const set = (key: string, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));
  return (
    <FormShell
      title={id ? "编辑小鼠档案" : "新增小鼠"}
      type={id ? "mouse.update" : "mouse.create"}
      payload={() => ({
        ...form,
        ...(id
          ? { id, cageId: mouse?.cageId }
          : { avatarSeed: seed, appearance, appearanceLocked: true }),
      })}
      after={(result) => {
        back();
        if (!id) open({ kind: "mouse", id: result.id });
      }}
    >
      {!id && (
        <div className="avatar-picker">
          <MouseSprite appearance={appearance} />
          <div>
            <strong>这位小住客，长这样。</strong>
            <p>
              {coatLabels[appearance.coat]} ·{" "}
              {appearance.ears === "large" ? "大圆耳" : "圆耳"} ·{" "}
              {appearance.expression === "sleepy" ? "困困脸" : "好奇脸"}
            </p>
            <button
              type="button"
              className="button small"
              onClick={() => {
                const n = Math.floor(Math.random() * 2 ** 30);
                setSeed(n);
                setAppearance(appearanceFor(n));
              }}
            >
              <Dices size={14} />
              换一套候选
            </button>
          </div>
          <LockKeyhole size={15} className="muted" />
        </div>
      )}
      <div className="form-grid">
        <Field label="小鼠编号 *">
          <input
            name="code"
            value={form.code}
            onChange={(e) => set("code", e.target.value)}
            required
            maxLength={64}
          />
        </Field>
        <Field label="基因型">
          <input
            name="genotype"
            value={form.genotype}
            onChange={(e) => set("genotype", e.target.value)}
            placeholder="待鉴定 / WT / Het / KO"
          />
        </Field>
        <Field
          label="出生日期 *"
          hint={
            mouse?.birthLitterId ? "同窝出生日期在窝次中整体更正" : undefined
          }
        >
          <input
            name="dob"
            type="date"
            max={state.today}
            value={form.dob}
            onChange={(e) => set("dob", e.target.value)}
            required
            disabled={!!mouse?.birthLitterId}
          />
        </Field>
        <Field label="性别">
          <select
            name="sex"
            value={form.sex}
            onChange={(e) => set("sex", e.target.value)}
          >
            {Object.entries(sexLabel).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        {!id && (
          <Field label="当前笼位 *" wide>
            <CageSelect
              value={form.cageId}
              onChange={(v) => set("cageId", v)}
            />
          </Field>
        )}
      </div>
      {!id && (
        <CapacityPreview
          cageId={form.cageId}
          adding={1}
          reason={form.capacityReason}
          onReason={(v) => set("capacityReason", v)}
        />
      )}
      <details className="more-info" open={!!id}>
        <summary>更多资料</summary>
        <div className="form-grid">
          <Field label="昵称">
            <input
              value={form.nickname}
              onChange={(e) => set("nickname", e.target.value)}
              placeholder="例如：奶糖"
            />
          </Field>
          <Field label="品系 / 背景">
            <input
              value={form.strain}
              onChange={(e) => set("strain", e.target.value)}
            />
          </Field>
          <Field label="生物学母亲">
            <MouseSelect
              name="motherId"
              value={form.motherId}
              onChange={(v) => set("motherId", v)}
              sex="female"
              exclude={id}
              allowArchived
            />
          </Field>
          <Field label="生物学父亲">
            <MouseSelect
              name="fatherId"
              value={form.fatherId}
              onChange={(v) => set("fatherId", v)}
              exclude={id}
              allowArchived
            />
          </Field>
          <Field label="母亲关系">
            <select
              value={form.motherStatus}
              onChange={(e) => set("motherStatus", e.target.value)}
            >
              <option value="confirmed">已确认</option>
              <option value="candidate">候选 / 待确认</option>
            </select>
          </Field>
          <Field label="父亲关系">
            <select
              value={form.fatherStatus}
              onChange={(e) => set("fatherStatus", e.target.value)}
            >
              <option value="confirmed">已确认</option>
              <option value="candidate">候选 / 待确认</option>
            </select>
          </Field>
          <Field label="寄养母">
            <MouseSelect
              name="fosterMotherId"
              value={form.fosterMotherId}
              onChange={(v) => set("fosterMotherId", v)}
              sex="female"
              exclude={id}
              allowArchived
            />
          </Field>
          <Field label="断奶状态">
            <select
              name="weaningStatus"
              value={form.weaningStatus}
              onChange={(e) => set("weaningStatus", e.target.value)}
            >
              <option value="unknown">未记录</option>
              <option value="unweaned">未断奶</option>
              <option value="weaned">已断奶</option>
            </select>
          </Field>
          {form.weaningStatus === "weaned" && (
            <Field label="实际断奶日期（可未知）">
              <input
                name="weanedOn"
                type="date"
                min={form.dob}
                max={state.today}
                value={form.weanedOn}
                onChange={(e) => set("weanedOn", e.target.value)}
              />
            </Field>
          )}
          <Field label="性格（趣味标签）">
            <select
              value={form.personality}
              onChange={(e) => set("personality", e.target.value)}
            >
              <option value="">不设置</option>
              {["安静", "好奇", "爱睡", "爱筑巢", "贪吃", "社交"].map((v) => (
                <option key={v}>{v}</option>
              ))}
            </select>
          </Field>
          <Field label="真实表型备注" wide>
            <textarea
              value={form.phenotype}
              onChange={(e) => set("phenotype", e.target.value)}
              placeholder="与装饰头像分开记录"
            />
          </Field>
          <Field label="备注" wide>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
            />
          </Field>
          {id && (
            <Field label="更正原因（修改关系时必填）" wide>
              <input
                name="reason"
                value={form.reason}
                onChange={(e) => set("reason", e.target.value)}
              />
            </Field>
          )}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={form.dobEstimated}
              onChange={(e) => set("dobEstimated", e.target.checked)}
            />
            出生日期为估计
          </label>
        </div>
      </details>
    </FormShell>
  );
}
export function CageForm({ id }: { id?: string }) {
  const { state, back, open } = useApp(),
    c = state.cages.find((c) => c.id === id);
  const [form, setForm] = useState({
    code: c?.code || "",
    nickname: c?.nickname || "",
    capacity: c?.capacity || state.settings.defaultCapacity,
    purpose: c?.purpose || "normal",
    notes: c?.notes || "",
    capacityReason: "",
  });
  const set = (k: string, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <FormShell
      title={id ? "编辑笼位" : "新增笼位"}
      type={id ? "cage.update" : "cage.create"}
      payload={() => ({ ...form, id })}
      after={(r) => {
        back();
        if (!id) open({ kind: "cage", id: r.id });
      }}
    >
      <div className="form-grid">
        <Field label="笼号 *">
          <input
            name="code"
            required
            value={form.code}
            onChange={(e) => set("code", e.target.value)}
            placeholder="例如 A003"
          />
        </Field>
        <Field label="小窝名称">
          <input
            value={form.nickname}
            onChange={(e) => set("nickname", e.target.value)}
            placeholder="给它取个名字"
          />
        </Field>
        <Field label="配置容量 *">
          <input
            name="capacity"
            type="number"
            min="1"
            max="500"
            required
            value={form.capacity}
            onChange={(e) => set("capacity", e.target.value)}
          />
        </Field>
        <Field label="用途">
          <select
            value={form.purpose}
            onChange={(e) => set("purpose", e.target.value)}
          >
            {Object.entries(purposeLabel).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label="备注" wide>
          <textarea
            value={form.notes}
            onChange={(e) => set("notes", e.target.value)}
          />
        </Field>
      </div>
      {c && cageMembers(state, c.id).length > Number(form.capacity) && (
        <Field label="超容量原因">
          <input
            name="capacityReason"
            value={form.capacityReason}
            onChange={(e) => set("capacityReason", e.target.value)}
            required
          />
        </Field>
      )}
    </FormShell>
  );
}
export function CleanForm({ data = {} }: { data?: Record<string, any> }) {
  const { state } = useApp(),
    [selected, setSelected] = useState<string[]>(data.cageIds || []),
    [on, setOn] = useState(state.today),
    [dates, setDates] = useState<Record<string, string>>({}),
    [notes, setNotes] = useState("");
  const cages = state.cages.filter((c) => !c.archived);
  return (
    <FormShell
      title="记录实际换笼"
      type="cleaning.complete"
      payload={() => ({
        cageIds: selected,
        date: on,
        dates,
        notes,
        occurrenceIds: Object.fromEntries(
          selected.map((id) => [id, currentOccurrence(state, id)?.id || null]),
        ),
      })}
      disabled={!selected.length}
      submitLabel={`确认 ${selected.length} 笼已换笼`}
    >
      <div className="form-callout">
        <Check size={18} />
        <span>只登记已经实际完成的换笼。下一次从实际日期起算。</span>
      </div>
      <Field label="默认实际日期 *">
        <input
          name="date"
          type="date"
          max={state.today}
          value={on}
          onChange={(e) => setOn(e.target.value)}
          required
        />
      </Field>
      <div className="check-list">
        {cages.map((c) => {
          const checked = selected.includes(c.id),
            date = dates[c.id] || on;
          return (
            <div
              className={`check-item ${checked ? "checked" : ""}`}
              key={c.id}
            >
              <label>
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) =>
                    setSelected((v) =>
                      e.target.checked
                        ? [...v, c.id]
                        : v.filter((x) => x !== c.id),
                    )
                  }
                />
                <strong>{c.code}</strong>
                <span>{c.nickname}</span>
              </label>
              {checked && (
                <div className="per-cage-date">
                  <input
                    type="date"
                    max={state.today}
                    value={date}
                    aria-label={`${c.code} 实际换笼日期`}
                    onChange={(e) =>
                      setDates((d) => ({ ...d, [c.id]: e.target.value }))
                    }
                  />
                  <small>
                    {c.lastCleanedOn && date < c.lastCleanedOn
                      ? "补录历史，不覆盖最近记录"
                      : c.plan
                        ? `下次 ${shortDate(addDays(date, c.plan.futureIntervalDays || c.plan.intervalDays))}`
                        : "尚未设置周期"}
                  </small>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <Field label="备注">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </Field>
    </FormShell>
  );
}
export function PlanForm({ data = {} }: { data?: Record<string, any> }) {
  const { state } = useApp(),
    [selected, setSelected] = useState<string[]>(data.cageIds || []),
    c = state.cages.find((c) => c.id === selected[0]);
  const [interval, setInterval] = useState(
      c?.plan?.intervalDays || state.settings.defaultIntervalDays,
    ),
    [first, setFirst] = useState(
      c ? currentOccurrence(state, c.id)?.scheduledOn || "" : "",
    ),
    [time, setTime] = useState(
      c?.plan?.reminderTime || state.settings.reminderTime,
    ),
    [ahead, setAhead] = useState(c?.plan?.aheadDays ?? 1),
    [overdue, setOverdue] = useState(c?.plan?.overdue ?? true),
    [paused, setPaused] = useState(c?.plan?.paused || false),
    [reason, setReason] = useState(""),
    [resumeOn, setResumeOn] = useState(""),
    [apply, setApply] = useState("current");
  return (
    <FormShell
      title="换笼周期"
      type="plan.set"
      payload={() => ({
        cageIds: selected,
        intervalDays: interval,
        firstDueOn: first,
        reminderTime: time,
        aheadDays: ahead,
        overdue,
        paused,
        reason,
        resumeOn,
        apply,
      })}
      disabled={!selected.length}
    >
      <div className="check-list compact-checks">
        {state.cages
          .filter((c) => !c.archived)
          .map((c) => (
            <label key={c.id} className="checkbox-label">
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                onChange={(e) =>
                  setSelected((v) =>
                    e.target.checked
                      ? [...v, c.id]
                      : v.filter((x) => x !== c.id),
                  )
                }
              />
              <strong>{c.code}</strong>
              <span>{c.nickname}</span>
            </label>
          ))}
      </div>
      <div className="form-grid">
        <Field label="每隔 N 天 *">
          <input
            name="intervalDays"
            type="number"
            min="1"
            max="365"
            required
            value={interval}
            onChange={(e) => setInterval(Number(e.target.value))}
          />
        </Field>
        <Field label="提醒时刻">
          <input
            name="reminderTime"
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
            required
          />
        </Field>
        <Field
          label="首次 / 本次计划日期"
          hint="有换笼历史时可留空，由最近实际日计算。"
          wide
        >
          <input
            name="firstDueOn"
            type="date"
            value={first}
            onChange={(e) => setFirst(e.target.value)}
          />
        </Field>
        <Field label="提前几天提醒">
          <input
            name="aheadDays"
            type="number"
            min="0"
            max="30"
            value={ahead}
            onChange={(e) => setAhead(Number(e.target.value))}
          />
        </Field>
        <Field label="周期变更生效">
          <select value={apply} onChange={(e) => setApply(e.target.value)}>
            <option value="current">本次生效</option>
            <option value="next">下次完成后生效</option>
          </select>
        </Field>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={overdue}
            onChange={(e) => setOverdue(e.target.checked)}
          />
          逾期每日汇总提醒
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={paused}
            onChange={(e) => setPaused(e.target.checked)}
          />
          暂停计划
        </label>
        {paused && (
          <Field label="拟恢复日期（届时复核）">
            <input
              type="date"
              value={resumeOn}
              onChange={(e) => setResumeOn(e.target.value)}
            />
          </Field>
        )}
        <Field label="调整 / 暂停原因" wide>
          <input
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </Field>
      </div>
      <div className="preview-box">
        <h4>将影响 {selected.length} 个小窝</h4>
        {selected.map((id) => {
          const c = state.cages.find((c) => c.id === id)!;
          return (
            <p key={id}>
              <strong>{c.code}</strong>
              <ArrowRight size={12} />
              {paused
                ? "暂停"
                : !cageMembers(state, id).length
                  ? "空笼，将保持暂停"
                  : apply === "next" && c.plan
                    ? `下次完成后每 ${interval} 天`
                    : first ||
                      (c.lastCleanedOn
                        ? addDays(c.lastCleanedOn, interval)
                        : "需要填写首次日期")}
            </p>
          );
        })}
      </div>
    </FormShell>
  );
}
export function TransferForm({
  data = {},
  wean = false,
}: {
  data?: Record<string, any>;
  wean?: boolean;
}) {
  const { state } = useApp(),
    [selected, setSelected] = useState<string[]>(data.mouseIds || []),
    [target, setTarget] = useState(""),
    [on, setOn] = useState(state.today),
    [reason, setReason] = useState(""),
    [endNursing, setEndNursing] = useState(false),
    [destinations, setDestinations] = useState<Record<string, string>>({}),
    [split, setSplit] = useState(false),
    [confirmed, setConfirmed] = useState(false);
  const candidates = state.mice.filter(
    (m) =>
      m.status === "active" &&
      (!wean || m.weaningStatus !== "weaned") &&
      (!data.litterId || m.birthLitterId === data.litterId),
  );
  const family = state.mice.filter(
    (m) =>
      m.status === "active" &&
      m.weaningStatus === "unweaned" &&
      selected.some((id) => {
        const parent = state.mice.find((p) => p.id === id);
        return (
          parent?.cageId === m.cageId &&
          (m.motherId === id || m.fosterMotherId === id)
        );
      }),
  );
  const targetIds = [
    ...new Set(
      selected.map((id) =>
        split
          ? destinations[id] || state.mice.find((m) => m.id === id)!.cageId!
          : target || state.mice.find((m) => m.id === id)!.cageId!,
      ),
    ),
  ];
  return (
    <FormShell
      title={wean ? "登记实际断奶" : "转笼"}
      type={wean ? "litter.wean" : "mouse.transfer"}
      payload={() => ({
        mouseIds: selected,
        cageId: target,
        date: on,
        capacityReason: reason,
        endNursing,
        destinations: split ? destinations : undefined,
      })}
      disabled={!selected.length || !confirmed || (!wean && !target && !split)}
      submitLabel={wean ? "确认实际断奶" : "确认转笼"}
    >
      <div className="form-callout">
        <Info size={18} />
        <span>
          {wean
            ? "可以分批断奶，按每只鼠的实际去向登记。"
            : "转笼只改变当前位置，亲缘与换笼日期独立保留。"}
        </span>
      </div>
      {family.length > 0 && (
        <button
          type="button"
          className="button small"
          onClick={() =>
            setSelected((v) => [...new Set([...v, ...family.map((m) => m.id)])])
          }
        >
          一并选择同笼未断奶子代（{family.length} 只）
        </button>
      )}
      <div className="check-list">
        {candidates.map((m) => (
          <label className="check-item" key={m.id}>
            <input
              type="checkbox"
              checked={selected.includes(m.id)}
              onChange={(e) => {
                setConfirmed(false);
                setSelected((v) =>
                  e.target.checked ? [...v, m.id] : v.filter((x) => x !== m.id),
                );
              }}
            />
            <MouseSprite mouse={m} />
            <strong>{m.code}</strong>
            <span>{m.nickname}</span>
            <Badge>{state.cages.find((c) => c.id === m.cageId)?.code}</Badge>
          </label>
        ))}
      </div>
      <div className="form-grid">
        <Field label={wean ? "实际断奶日期 *" : "实际转笼日期 *"}>
          <input
            name="date"
            type="date"
            max={state.today}
            value={on}
            onChange={(e) => setOn(e.target.value)}
            required
          />
        </Field>
        <Field label="目标笼位">
          <select
            name="cageId"
            value={target}
            onChange={(e) => {
              setTarget(e.target.value);
              setConfirmed(false);
            }}
            required={!wean && !split}
          >
            <option value="">{wean ? "留在原笼" : "选择目标笼位"}</option>
            {state.cages
              .filter((c) => !c.archived)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code} · {c.nickname}
                </option>
              ))}
          </select>
        </Field>
      </div>
      {wean && (
        <>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={split}
              onChange={(e) => {
                setSplit(e.target.checked);
                setConfirmed(false);
              }}
            />
            分别选择去向
          </label>
          {split &&
            selected.map((id) => {
              const m = state.mice.find((m) => m.id === id)!;
              return (
                <Field key={id} label={m.code}>
                  <select
                    value={destinations[id] || m.cageId!}
                    onChange={(e) =>
                      setDestinations((v) => ({ ...v, [id]: e.target.value }))
                    }
                  >
                    {state.cages
                      .filter((c) => !c.archived)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.code}
                        </option>
                      ))}
                  </select>
                </Field>
              );
            })}
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={endNursing}
              onChange={(e) => setEndNursing(e.target.checked)}
            />
            同时确认所选幼鼠对应窝的实际哺育结束
          </label>
        </>
      )}
      {targetIds.map((id) => (
        <CapacityPreview
          key={id}
          cageId={id}
          adding={
            selected.filter(
              (mid) =>
                (split
                  ? destinations[mid] ||
                    state.mice.find((m) => m.id === mid)!.cageId
                  : target || state.mice.find((m) => m.id === mid)!.cageId) ===
                id,
            ).length
          }
          moving={selected}
          reason={reason}
          onReason={setReason}
        />
      ))}
      <div className="preview-box">
        <strong>
          {selected.length} 只小鼠将被记录{wean ? "断奶" : "转笼"}
        </strong>
        <p>
          {selected
            .map((id) => state.mice.find((m) => m.id === id)?.code)
            .join("、")}
        </p>
      </div>
      <label className="checkbox-label confirmation">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(e) => setConfirmed(e.target.checked)}
          required
        />
        已核对上述个体、日期和去向
      </label>
    </FormShell>
  );
}
export function CareForm({ data = {} }: { data?: Record<string, any> }) {
  const { state } = useApp(),
    [selected, setSelected] = useState<string[]>(data.cageIds || []),
    [kind, setKind] = useState(data.kind || "water"),
    [on, setOn] = useState(data.date || state.today),
    [notes, setNotes] = useState(""),
    [value, setValue] = useState(""),
    [observer, setObserver] = useState(""),
    [photoUrl, setPhotoUrl] = useState(""),
    [experimentalFact, setExperimentalFact] = useState(true),
    [mouseId, setMouseId] = useState(data.mouseId || ""),
    [planned, setPlanned] = useState(!!data.planned);
  return (
    <FormShell
      title="照护记录"
      type={planned ? "care.plan" : "care.record"}
      payload={() => ({
        cageIds: selected,
        kind,
        date: on,
        notes,
        value,
        observer,
        photoUrl,
        experimentalFact,
        mouseId,
        taskId: data.taskId,
        litterId: data.litterId,
      })}
      disabled={!selected.length}
      submitLabel={planned ? "安排照护" : "记录已完成"}
    >
      <div className="segmented wide-segment">
        <button
          type="button"
          className={!planned ? "active" : ""}
          onClick={() => setPlanned(false)}
        >
          登记已完成
        </button>
        <button
          type="button"
          className={planned ? "active" : ""}
          onClick={() => setPlanned(true)}
        >
          安排待办
        </button>
      </div>
      <div className="form-grid">
        <Field label="照护事项">
          <select
            name="kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
          >
            {Object.entries(careLabel).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Field>
        <Field label={planned ? "计划日期 *" : "实际日期 *"}>
          <input
            name="date"
            type="date"
            max={planned ? undefined : state.today}
            value={on}
            onChange={(e) => setOn(e.target.value)}
            required
          />
        </Field>
      </div>
      <div className="check-list compact-checks">
        {state.cages
          .filter((c) => !c.archived)
          .map((c) => (
            <label key={c.id} className="checkbox-label">
              <input
                type="checkbox"
                checked={selected.includes(c.id)}
                onChange={(e) => {
                  setMouseId("");
                  setSelected((v) =>
                    e.target.checked
                      ? [...v, c.id]
                      : v.filter((x) => x !== c.id),
                  );
                }}
              />
              <strong>{c.code}</strong>
              <span>{c.nickname}</span>
            </label>
          ))}
      </div>
      {selected.length === 1 && (
        <Field label="具体小鼠（可选）">
          <select
            name="mouseId"
            value={mouseId}
            onChange={(e) => setMouseId(e.target.value)}
            required={!planned && kind === "phenotype"}
          >
            <option value="">整个笼位</option>
            {cageMembers(state, selected[0]).map((m) => (
              <option key={m.id} value={m.id}>
                {m.code} · {m.nickname}
              </option>
            ))}
          </select>
        </Field>
      )}
      {!planned && kind === "phenotype" && selected.length > 1 && (
        <p className="field-note">表型观察请选择一个笼位和一只具体小鼠。</p>
      )}
      {!planned && kind === "weight" && (
        <Field label="体重 / 克">
          <input
            name="value"
            type="number"
            min="0"
            max="1000"
            step="0.01"
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        </Field>
      )}
      <Field label="记录人（可选）">
        <input
          name="observer"
          value={observer}
          onChange={(e) => setObserver(e.target.value)}
        />
      </Field>
      {!planned && (
        <Field label="照片链接（可选）">
          <input
            name="photoUrl"
            type="url"
            maxLength={2048}
            value={photoUrl}
            onChange={(e) => setPhotoUrl(e.target.value)}
            placeholder="https://"
          />
        </Field>
      )}
      <Field
        label={
          kind === "phenotype"
            ? "实际观察到的表型"
            : kind === "milestone"
              ? "已发生的成长节点"
              : "备注"
        }
      >
        <textarea
          name="notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          required={!planned && kind === "phenotype"}
          placeholder={
            kind === "milestone"
              ? "例如：第一次睁眼，或第一次独立进食"
              : undefined
          }
        />
      </Field>
      {!planned && kind === "phenotype" && (
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={experimentalFact}
            onChange={(e) => setExperimentalFact(e.target.checked)}
          />
          作为实验事实记录
        </label>
      )}
    </FormShell>
  );
}
