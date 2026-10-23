import { randomUUID } from "node:crypto";
import type {
  AppState,
  Cage,
  Mouse,
  Event,
  Reminder,
  CareOccurrence,
  Breeding,
  Litter,
  Settings,
} from "../shared/types.js";
import { careLabel } from "../shared/types.js";
import { safePhotoLink } from "../shared/photos.js";
import { addDays, daysBetween, todayIn, validDate } from "../shared/dates.js";
import {
  appearanceFor,
  litterAppearance,
  coats,
} from "../shared/appearance.js";

export class DomainError extends Error {
  constructor(
    message: string,
    public field = "",
    public status = 422,
  ) {
    super(message);
  }
}
function need(
  condition: unknown,
  message: string,
  field = "",
): asserts condition {
  if (!condition) throw new DomainError(message, field);
}
const uid = () => randomUUID();
const text = (value: unknown, limit = 2000) =>
  typeof value === "string" ? value.trim().slice(0, limit) : "";
function date(value: unknown, field: string, today?: string): string {
  need(validDate(value), "请填写有效日期", field);
  if (today) need(value <= today, "实际日期不能晚于今天", field);
  return value;
}
function integer(
  value: unknown,
  min: number,
  max: number,
  field: string,
): number {
  const n = Number(value);
  need(
    Number.isInteger(n) && n >= min && n <= max,
    `请输入 ${min}–${max} 之间的整数`,
    field,
  );
  return n;
}
function get<T extends { id: string }>(
  rows: T[],
  id: unknown,
  name = "记录",
): T {
  const row = rows.find((x) => x.id === id);
  need(row, `${name}不存在或已被移除`);
  return row;
}
function ids(value: unknown): string[] {
  need(
    Array.isArray(value) && value.every((x) => typeof x === "string"),
    "请选择有效对象",
  );
  return [...new Set(value)];
}
function code(
  value: unknown,
  rows: { code: string; id: string; aliases?: string[] }[],
  id?: string,
): string {
  const result = text(value, 64);
  need(result, "编号不能为空", "code");
  need(
    !rows.some(
      (r) =>
        r.id !== id &&
        (r.code.toLowerCase() === result.toLowerCase() ||
          r.aliases?.some((a) => a.toLowerCase() === result.toLowerCase())),
    ),
    "该编号或历史编号已被使用",
    "code",
  );
  return result;
}
function event(
  s: AppState,
  type: string,
  title: string,
  on: string,
  options: Partial<Event> = {},
): Event {
  const row: Event = {
    id: uid(),
    type,
    date: on,
    createdAt: new Date().toISOString(),
    mouseIds: [],
    cageIds: [],
    title,
    notes: "",
    details: {},
    ...options,
  };
  s.events.push(row);
  return row;
}
export function emptyState(): AppState {
  const settings: Settings = {
    timezone: "Asia/Shanghai",
    defaultCapacity: 5,
    defaultIntervalDays: 7,
    reminderTime: "09:00",
    quietStart: "22:00",
    quietEnd: "08:00",
    motion: "full",
    stories: true,
    personalities: true,
    anniversaries: true,
    pushEnabled: true,
  };
  return {
    revision: 0,
    today: todayIn(settings.timezone),
    demo: false,
    settings,
    mice: [],
    cages: [],
    breedings: [],
    litters: [],
    occurrences: [],
    events: [],
    reminders: [],
    careTasks: [],
  };
}
export const members = (s: AppState, cageId: string) =>
  s.mice.filter((m) => m.status === "active" && m.cageId === cageId);
export function ancestors(
  s: AppState,
  mouseId: string,
  seen = new Set<string>(),
): Set<string> {
  if (seen.has(mouseId)) return seen;
  seen.add(mouseId);
  const m = s.mice.find((x) => x.id === mouseId);
  if (m?.motherId && m.motherStatus === "confirmed")
    ancestors(s, m.motherId, seen);
  if (m?.fatherId && m.fatherStatus === "confirmed")
    ancestors(s, m.fatherId, seen);
  return seen;
}
export function commonAncestors(s: AppState, a: string, b: string): string[] {
  const left = ancestors(s, a),
    right = ancestors(s, b);
  return [...left].filter((x) => right.has(x));
}
function validateParents(s: AppState, m: Mouse) {
  for (const [key, sex, status] of [
    ["motherId", "female", m.motherStatus],
    ["fatherId", "male", m.fatherStatus],
  ] as const) {
    const parentId = m[key];
    if (!parentId) continue;
    const parent = get(s.mice, parentId, "亲本");
    need(parent.id !== m.id, "个体不能成为自己的亲本", key);
    need(parent.dob < m.dob, "亲本出生日期必须早于子代", key);
    if (status === "confirmed")
      need(
        parent.sex === sex,
        `已确认${key === "motherId" ? "母" : "父"}鼠的性别不符，请先复核档案`,
        key,
      );
    // Candidate edges also cannot make a circular pedigree.
    const walk = (id: string, seen = new Set<string>()): boolean => {
      if (id === m.id) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      const row = s.mice.find((x) => x.id === id);
      return (
        !!row && [row.motherId, row.fatherId].some((p) => p && walk(p, seen))
      );
    };
    need(!walk(parentId), "这项关系会形成家系循环", key);
  }
  if (m.fosterMotherId) {
    const foster = get(s.mice, m.fosterMotherId, "寄养母");
    need(
      foster.sex === "female" && foster.dob < m.dob && foster.id !== m.id,
      "寄养母的性别或出生日期不符",
      "fosterMotherId",
    );
  }
}
function validateAllParents(s: AppState) {
  s.mice.forEach((m) => validateParents(s, m));
}
function capacity(s: AppState, cageId: string, reason: unknown) {
  const cage = get(s.cages, cageId, "笼位");
  const count = members(s, cageId).length;
  need(
    count <= cage.capacity || text(reason),
    `${cage.code} 保存后 ${count}/${cage.capacity}，请填写超容量原因`,
    "capacityReason",
  );
}
function activeCage(s: AppState, id: unknown): Cage {
  const c = get(s.cages, id, "笼位");
  need(!c.archived, "不能使用已归档笼位", "cageId");
  return c;
}
function optionalDate(
  v: unknown,
  field: string,
  today?: string,
): string | null {
  return v ? date(v, field, today) : null;
}
function makeMouse(s: AppState, p: Record<string, any>): Mouse {
  const seed =
    p.avatarSeed == null
      ? Math.floor(Math.random() * 2 ** 30)
      : integer(p.avatarSeed, 0, 2 ** 32 - 1, "avatarSeed");
  const c = activeCage(s, p.cageId);
  const m: Mouse = {
    id: uid(),
    code: code(p.code, s.mice),
    aliases: [],
    nickname: text(p.nickname, 40),
    genotype: text(p.genotype, 120),
    strain: text(p.strain, 120),
    dob: date(p.dob, "dob", s.today),
    dobEstimated: !!p.dobEstimated,
    sex: ["male", "female", "unknown"].includes(p.sex) ? p.sex : "unknown",
    cageId: c.id,
    status: "active",
    motherId: p.motherId || null,
    fatherId: p.fatherId || null,
    motherStatus: p.motherStatus === "candidate" ? "candidate" : "confirmed",
    fatherStatus: p.fatherStatus === "candidate" ? "candidate" : "confirmed",
    fosterMotherId: p.fosterMotherId || null,
    birthLitterId: null,
    weaningStatus: ["unknown", "unweaned", "weaned"].includes(p.weaningStatus)
      ? p.weaningStatus
      : "unknown",
    weanedOn: optionalDate(p.weanedOn, "weanedOn", s.today),
    avatarSeed: seed,
    appearance: appearanceFor(seed),
    appearanceLocked: !!p.appearanceLocked,
    personality: text(p.personality, 20),
    phenotype: text(p.phenotype),
    notes: text(p.notes),
    breedingStopped: false,
    version: 1,
  };
  if (p.appearance) m.appearance = safeAppearance(p.appearance, seed);
  if (m.weanedOn) {
    need(m.weanedOn >= m.dob, "断奶日期不能早于出生日期", "weanedOn");
    need(
      m.weaningStatus === "weaned",
      "填写断奶日期前请选择已断奶",
      "weaningStatus",
    );
  }
  validateParents(s, m);
  return m;
}
function safeAppearance(value: any, seed: number): Mouse["appearance"] {
  const fallback = appearanceFor(seed);
  const options: Record<string, string[]> = {
    coat: coats,
    pattern: ["solid", "cap", "socks", "blaze"],
    ears: ["round", "large"],
    eyes: ["black", "brown", "ruby"],
    face: ["round", "pointed"],
    body: ["round", "slender"],
    tail: ["curl", "long"],
    expression: ["curious", "sleepy", "gentle"],
  };
  for (const [key, values] of Object.entries(options)) {
    need(values.includes(value?.[key]), "外观候选无效", "appearance");
    (fallback as any)[key] = value[key];
    const source = text(value.provenance?.[key], 48);
    fallback.provenance[key] =
      /妈妈相似|爸爸相似|同窝共享|随机生成|人工记录|未知/.test(source)
        ? source
        : "人工记录";
  }
  return fallback;
}
function newOccurrence(
  s: AppState,
  cage: Cage,
  dueOn: string,
  sourceId: string | null = null,
) {
  if (
    s.occurrences.some(
      (o) => o.cageId === cage.id && ["pending", "paused"].includes(o.status),
    )
  )
    return;
  if (sourceId && s.occurrences.some((o) => o.sourceId === sourceId)) return;
  s.occurrences.push({
    id: uid(),
    cageId: cage.id,
    originalDueOn: dueOn,
    scheduledOn: dueOn,
    status: "pending",
    completedOn: null,
    eventId: null,
    sourceId,
    intervalDays: cage.plan!.intervalDays,
    adjustmentReason: "",
    snoozedUntil: null,
    revision: 1,
  });
}
function upsertReminder(
  s: AppState,
  row: Omit<
    Reminder,
    "status" | "handledAt" | "snoozedUntil" | "basisChanged" | "cancelReason"
  >,
  active = true,
) {
  const existing = s.reminders.find((r) => r.id === row.id);
  if (!existing) {
    if (active)
      s.reminders.push({
        ...row,
        status: "pending",
        handledAt: null,
        snoozedUntil: null,
        basisChanged: false,
        cancelReason: "",
      });
    return;
  }
  if (existing.dueOn !== row.dueOn && existing.status === "handled")
    existing.basisChanged = true;
  Object.assign(existing, row);
  if (!active && existing.status === "pending") {
    existing.status = "cancelled";
    existing.cancelReason = "关联记录已结束、暂停或归档";
  }
  if (active && existing.status === "cancelled") {
    existing.status = "pending";
    existing.cancelReason = "";
  }
}
export function reconcile(s: AppState, now = new Date()) {
  s.today = todayIn(s.settings.timezone, now);
  for (const cage of s.cages) {
    if (!cage.plan) continue;
    const empty = !members(s, cage.id).length;
    if (empty || cage.archived) {
      cage.plan.paused = true;
      cage.plan.pauseReason = empty
        ? "空笼暂停 · 启用时请复核首次日期"
        : "笼位已归档";
    }
    for (const o of s.occurrences.filter(
      (x) => x.cageId === cage.id && x.status === "pending",
    )) {
      if (cage.plan.paused) {
        o.status = "paused";
        o.revision++;
      }
    }
    if (
      !cage.plan.paused &&
      !empty &&
      !cage.archived &&
      !s.occurrences.some(
        (o) => o.cageId === cage.id && ["pending", "paused"].includes(o.status),
      )
    ) {
      const first = cage.lastCleanedOn
        ? addDays(cage.lastCleanedOn, cage.plan.intervalDays)
        : cage.plan.firstDueOn;
      if (first) newOccurrence(s, cage, first);
    }
  }
  for (const m of s.mice)
    for (const days of [70, 140] as const)
      upsertReminder(
        s,
        {
          id: `age:${m.id}:${days}`,
          kind: days === 70 ? "age70" : "age140",
          subjectId: m.id,
          dueOn: addDays(m.dob, days),
          title: `${m.code} · 满 ${days / 7} 周${m.dobEstimated ? "（估计生日）" : ""}`,
        },
        m.status === "active",
      );
  for (const o of s.occurrences) {
    const c = get(s.cages, o.cageId);
    upsertReminder(
      s,
      {
        id: `clean:${o.id}`,
        kind: "cleaning",
        subjectId: o.id,
        dueOn: o.scheduledOn,
        title: `${c.code} · 换笼`,
      },
      o.status === "pending",
    );
    const r = s.reminders.find((x) => x.id === `clean:${o.id}`);
    if (r && o.status === "completed") {
      r.status = "handled";
      r.handledAt ||= o.completedOn;
    }
  }
  for (const b of s.breedings) {
    const mother = get(s.mice, b.motherId);
    const active = b.status !== "ended" && mother.status === "active";
    if (b.reviewOn)
      upsertReminder(
        s,
        {
          id: `review:${b.id}`,
          kind: "review",
          subjectId: b.id,
          dueOn: b.reviewOn,
          title: `${mother.code} · 妊娠记录待复核`,
        },
        active,
      );
    if (b.dueFrom)
      upsertReminder(
        s,
        {
          id: `birth:${b.id}`,
          kind: "birth",
          subjectId: b.id,
          dueOn: b.dueFrom,
          title: `${mother.code} · 预计产仔关注`,
        },
        active,
      );
    for (const r of s.reminders.filter(
      (r) =>
        r.subjectId === b.id &&
        (!active ||
          (r.kind === "review" && !b.reviewOn) ||
          (r.kind === "birth" && !b.dueFrom)),
    ))
      if (r.status === "pending") {
        r.status = "cancelled";
        r.cancelReason = "繁育记录结束或计划已取消";
      }
  }
  for (const l of s.litters)
    if (l.weanDueOn) {
      const unweaned = s.mice.filter(
        (m) =>
          m.birthLitterId === l.id &&
          m.status === "active" &&
          m.weaningStatus === "unweaned",
      );
      upsertReminder(
        s,
        {
          id: `wean:${l.id}`,
          kind: "weaning",
          subjectId: l.id,
          dueOn: l.weanDueOn,
          title: `${l.code} · ${unweaned.length} 只待断奶`,
        },
        unweaned.length > 0,
      );
    }
  for (const t of s.careTasks) {
    const c = get(s.cages, t.cageId);
    upsertReminder(
      s,
      {
        id: `care:${t.id}`,
        kind: "care",
        subjectId: t.id,
        dueOn: t.dueOn,
        title: `${c.code} · ${careLabel[t.kind] || t.kind}`,
      },
      t.status === "pending" &&
        !c.archived &&
        (!t.mouseId || get(s.mice, t.mouseId).status === "active"),
    );
    const r = s.reminders.find((x) => x.id === `care:${t.id}`);
    if (r && t.status === "completed") {
      r.status = "handled";
      r.handledAt ||= s.today;
    }
  }
}

export function applyCommand(
  s: AppState,
  type: string,
  p: Record<string, any>,
): Record<string, unknown> {
  switch (type) {
    case "cage.create": {
      const cage: Cage = {
        id: uid(),
        code: code(p.code, s.cages),
        nickname: text(p.nickname, 40),
        capacity: integer(
          p.capacity ?? s.settings.defaultCapacity,
          1,
          500,
          "capacity",
        ),
        purpose: ["normal", "breeding", "nursery", "other"].includes(p.purpose)
          ? p.purpose
          : "normal",
        lastCleanedOn: null,
        plan: null,
        archived: false,
        notes: text(p.notes),
        version: 1,
      };
      s.cages.push(cage);
      event(s, type, `建立 ${cage.code} 小窝`, s.today, { cageIds: [cage.id] });
      return { id: cage.id };
    }
    case "cage.update": {
      const c = activeCage(s, p.id),
        old = structuredClone(c);
      c.code = code(p.code ?? c.code, s.cages, c.id);
      if (p.nickname !== undefined) c.nickname = text(p.nickname, 40);
      if (p.capacity !== undefined)
        c.capacity = integer(p.capacity, 1, 500, "capacity");
      if (p.purpose !== undefined) {
        need(
          ["normal", "breeding", "nursery", "other"].includes(p.purpose),
          "用途无效",
          "purpose",
        );
        c.purpose = p.purpose;
      }
      if (p.notes !== undefined) c.notes = text(p.notes);
      capacity(s, c.id, p.capacityReason);
      c.version++;
      event(s, type, `更新 ${c.code} 笼位`, s.today, {
        cageIds: [c.id],
        details: { old, current: c },
      });
      return { id: c.id };
    }
    case "cage.archive": {
      const c = activeCage(s, p.id);
      need(!members(s, c.id).length, "笼内仍有小鼠，请先处理个体去向");
      c.archived = true;
      for (const t of s.careTasks.filter(
        (t) => t.cageId === c.id && t.status === "pending",
      ))
        t.status = "cancelled";
      c.version++;
      event(s, type, `归档 ${c.code} 笼位`, s.today, { cageIds: [c.id] });
      return {};
    }
    case "cage.delete": {
      const c = get(s.cages, p.id);
      need(!members(s, c.id).length, "有成员的笼位不能删除");
      need(
        !s.events.some(
          (e) => e.cageIds.includes(c.id) && e.type !== "cage.create",
        ) &&
          !s.occurrences.some((o) => o.cageId === c.id) &&
          !s.careTasks.some((t) => t.cageId === c.id),
        "笼位已有历史，请使用归档",
      );
      s.cages = s.cages.filter((x) => x.id !== c.id);
      s.events = s.events.filter(
        (e) => !(e.type === "cage.create" && e.cageIds.includes(c.id)),
      );
      return {};
    }
    case "mouse.create": {
      const m = makeMouse(s, p);
      s.mice.push(m);
      capacity(s, m.cageId!, p.capacityReason);
      event(
        s,
        type,
        `登记 ${m.code}${m.nickname ? ` · ${m.nickname}` : ""}`,
        s.today,
        {
          mouseIds: [m.id],
          cageIds: [m.cageId!],
          notes: text(p.capacityReason),
        },
      );
      return { id: m.id };
    }
    case "mouse.update": {
      const m = get(s.mice, p.id, "小鼠"),
        old = structuredClone(m);
      if (p.cageId !== undefined)
        need(p.cageId === m.cageId, "请通过转笼流程修改当前笼位", "cageId");
      m.code = code(p.code ?? m.code, s.mice, m.id);
      if (old.code !== m.code) m.aliases.push(old.code);
      for (const key of [
        "nickname",
        "genotype",
        "strain",
        "notes",
        "phenotype",
        "personality",
      ] as const)
        if (p[key] !== undefined)
          m[key] = text(
            p[key],
            key === "notes" || key === "phenotype" ? 2000 : 120,
          );
      if (p.sex !== undefined) {
        need(["male", "female", "unknown"].includes(p.sex), "性别无效", "sex");
        m.sex = p.sex;
      }
      if (p.dob !== undefined) {
        const dob = date(p.dob, "dob", s.today);
        need(
          !m.birthLitterId || dob === m.dob,
          "同窝生日请在窝次中整体更正",
          "dob",
        );
        m.dob = dob;
      }
      if (p.dobEstimated !== undefined) m.dobEstimated = !!p.dobEstimated;
      for (const key of ["motherId", "fatherId", "fosterMotherId"] as const)
        if (p[key] !== undefined) {
          if (key === "motherId" && m.birthLitterId)
            need(p[key] === m[key], "共享母鼠请在窝次中整体更正", key);
          m[key] = p[key] || null;
        }
      for (const key of ["motherStatus", "fatherStatus"] as const)
        if (p[key] !== undefined) {
          need(
            ["confirmed", "candidate"].includes(p[key]),
            "关系状态无效",
            key,
          );
          m[key] = p[key];
        }
      const changedRelations = [
        "motherId",
        "fatherId",
        "motherStatus",
        "fatherStatus",
        "fosterMotherId",
      ].some((k) => (old as any)[k] !== (m as any)[k]);
      need(
        !changedRelations || text(p.reason),
        "更正亲缘关系需填写原因",
        "reason",
      );
      if (p.weaningStatus !== undefined) {
        need(
          ["unknown", "unweaned", "weaned"].includes(p.weaningStatus),
          "断奶状态无效",
        );
        m.weaningStatus = p.weaningStatus;
      }
      if (p.weanedOn !== undefined)
        m.weanedOn = optionalDate(p.weanedOn, "weanedOn", s.today);
      if (m.weanedOn)
        need(
          m.weaningStatus === "weaned" && m.weanedOn >= m.dob,
          "请复核断奶状态与日期",
          "weanedOn",
        );
      if (p.breedingStopped !== undefined)
        m.breedingStopped = !!p.breedingStopped;
      validateAllParents(s);
      m.version++;
      event(
        s,
        type,
        `更新 ${m.code} 档案${changedRelations ? "与关系" : ""}`,
        s.today,
        {
          mouseIds: [m.id],
          notes: text(p.reason),
          details: { old, current: structuredClone(m) },
        },
      );
      return { id: m.id };
    }
    case "mouse.appearance": {
      const m = get(s.mice, p.id, "小鼠");
      const old = structuredClone(m.appearance);
      m.appearance = p.reset
        ? appearanceFor(m.avatarSeed)
        : safeAppearance(p.appearance, m.avatarSeed);
      m.appearanceLocked = !!p.locked;
      m.version++;
      event(s, type, `确认 ${m.code} 的小窝形象`, s.today, {
        mouseIds: [m.id],
        details: { old, appearance: m.appearance },
      });
      return {};
    }
    case "mouse.archive": {
      const selected = ids(p.mouseIds);
      need(selected.length, "请选择小鼠");
      const on = date(p.date, "date", s.today);
      need(
        ["transferred", "deceased", "retired"].includes(p.status),
        "请选择去向",
        "status",
      );
      for (const id of selected) {
        const m = get(s.mice, id);
        need(m.status === "active", `${m.code} 已退出当前饲养`);
        need(on >= m.dob, "去向日期不能早于出生日期", "date");
        const cageId = m.cageId!;
        m.status = p.status;
        m.cageId = null;
        for (const t of s.careTasks.filter(
          (t) => t.mouseId === id && t.status === "pending",
        ))
          t.status = "cancelled";
        m.version++;
        for (const b of s.breedings.filter(
          (b) => b.motherId === id && b.status !== "ended",
        )) {
          b.status = "ended";
          b.endedOn = on;
          b.outcome = "母鼠退出当前饲养";
          b.version++;
        }
        for (const l of s.litters.filter(
          (l) => l.nursing && (l.fosterMotherId || l.motherId) === id,
        )) {
          l.nursing = false;
          l.nursingEndedOn = on;
          l.version++;
        }
        event(
          s,
          type,
          `${m.code} · ${p.status === "deceased" ? "已死亡" : p.status === "retired" ? "已结束实验" : "已转出"}`,
          on,
          {
            mouseIds: [id],
            cageIds: [cageId],
            notes: text(p.reason),
            details: { status: p.status },
          },
        );
      }
      return {};
    }
    case "mouse.delete": {
      const m = get(s.mice, p.id);
      need(
        !s.mice.some(
          (x) =>
            x.motherId === m.id ||
            x.fatherId === m.id ||
            x.fosterMotherId === m.id,
        ) &&
          !s.breedings.some(
            (b) => b.motherId === m.id || b.candidateFatherIds.includes(m.id),
          ) &&
          !m.birthLitterId &&
          !s.events.some(
            (e) => e.mouseIds.includes(m.id) && e.type !== "mouse.create",
          ),
        "此个体已有关系或历史，只能归档",
      );
      s.mice = s.mice.filter((x) => x.id !== m.id);
      s.events = s.events.filter(
        (e) => !(e.type === "mouse.create" && e.mouseIds.includes(m.id)),
      );
      s.reminders = s.reminders.filter((r) => r.subjectId !== m.id);
      return {};
    }
    case "mouse.transfer":
    case "litter.wean": {
      const selected = ids(p.mouseIds);
      need(selected.length, "请勾选实际操作的小鼠", "mouseIds");
      const on = date(p.date, "date", s.today);
      if (p.cageId) activeCage(s, p.cageId);
      const targets = new Set<string>();
      for (const id of selected) {
        const m = get(s.mice, id);
        need(m.status === "active", `${m.code} 当前不在笼`);
        need(on >= m.dob, "日期不能早于出生日期", "date");
        const oldCage = m.cageId!;
        const targetId = p.destinations?.[id] || p.cageId || oldCage;
        activeCage(s, targetId);
        if (type === "litter.wean") {
          need(m.weaningStatus !== "weaned", `${m.code} 已登记断奶`);
          m.weaningStatus = "weaned";
          m.weanedOn = on;
          event(s, type, `${m.code} · 实际断奶`, on, {
            mouseIds: [id],
            cageIds: [oldCage],
            litterId: m.birthLitterId || undefined,
            notes: text(p.notes),
          });
        } else need(oldCage !== targetId, `${m.code} 已在目标笼位`, "cageId");
        if (oldCage !== targetId) {
          const previous = s.events
            .filter(
              (e) => e.type === "mouse.transfer" && e.mouseIds.includes(id),
            )
            .sort((a, b) => b.date.localeCompare(a.date))[0];
          need(
            !previous || on >= previous.date,
            "转笼日期不能早于最近转笼记录",
            "date",
          );
          m.cageId = targetId;
          targets.add(targetId);
          event(
            s,
            "mouse.transfer",
            `${m.code} · ${get(s.cages, oldCage).code} → ${get(s.cages, targetId).code}`,
            on,
            {
              mouseIds: [id],
              cageIds: [oldCage, targetId],
              notes: text(p.capacityReason || p.notes),
              details: { from: oldCage, to: targetId },
            },
          );
        }
        m.version++;
      }
      targets.forEach((id) => capacity(s, id, p.capacityReason));
      if (type === "litter.wean" && p.endNursing) {
        const litterIds = new Set(
          selected.map((id) => get(s.mice, id).birthLitterId).filter(Boolean),
        );
        for (const id of litterIds) {
          const l = get(s.litters, id);
          l.nursing = false;
          l.nursingEndedOn = on;
          l.version++;
          event(s, "litter.nursingEnd", `${l.code} · 确认哺育结束`, on, {
            litterId: l.id,
            mouseIds: [l.fosterMotherId || l.motherId].filter(
              Boolean,
            ) as string[],
          });
        }
      }
      return {};
    }
    case "plan.set": {
      const selected = ids(p.cageIds || [p.cageId]);
      need(selected.length, "请选择笼位");
      const interval = integer(p.intervalDays, 1, 365, "intervalDays");
      need(
        /^([01]\d|2[0-3]):[0-5]\d$/.test(
          p.reminderTime || s.settings.reminderTime,
        ),
        "提醒时刻无效",
        "reminderTime",
      );
      for (const id of selected) {
        const c = activeCage(s, id);
        const existing = s.occurrences.find(
          (o) => o.cageId === id && ["pending", "paused"].includes(o.status),
        );
        if (p.apply === "next" && c.plan) {
          c.plan.futureIntervalDays = interval;
          c.plan.paused = !!p.paused;
          c.plan.pauseReason = text(p.reason);
          c.plan.resumeOn = optionalDate(p.resumeOn, "resumeOn");
          c.plan.reminderTime = p.reminderTime || c.plan.reminderTime;
          c.plan.aheadDays = integer(
            p.aheadDays ?? c.plan.aheadDays,
            0,
            30,
            "aheadDays",
          );
          c.plan.overdue = p.overdue !== false;
          if (existing) {
            existing.status =
              c.plan.paused || !members(s, id).length ? "paused" : "pending";
            existing.revision++;
          }
          c.version++;
          event(s, type, `${c.code} · 下次完成后调整周期`, s.today, {
            cageIds: [id],
            notes: text(p.reason),
            details: { futureIntervalDays: interval, paused: c.plan.paused },
          });
          continue;
        }
        const first =
          optionalDate(p.firstDueOn, "firstDueOn") ||
          (c.lastCleanedOn ? addDays(c.lastCleanedOn, interval) : null);
        need(
          first || !!p.paused,
          "没有换笼历史，请填写首次计划日期",
          "firstDueOn",
        );
        c.plan = {
          intervalDays: interval,
          paused: !!p.paused,
          pauseReason: text(p.reason),
          resumeOn: optionalDate(p.resumeOn, "resumeOn"),
          reminderTime: p.reminderTime || s.settings.reminderTime,
          aheadDays: integer(p.aheadDays ?? 1, 0, 30, "aheadDays"),
          overdue: p.overdue !== false,
          firstDueOn: first,
        };
        c.version++;
        if (existing) {
          existing.status =
            c.plan.paused || !members(s, id).length ? "paused" : "pending";
          if (first && p.apply === "current") {
            existing.scheduledOn = first;
            existing.adjustmentReason = text(p.reason) || "调整本次周期";
            existing.intervalDays = interval;
          }
          existing.revision++;
        }
        event(
          s,
          type,
          `${c.code} · ${c.plan.paused ? "暂停" : "设置"}换笼计划`,
          s.today,
          {
            cageIds: [id],
            details: {
              intervalDays: interval,
              firstDueOn: first,
              paused: c.plan.paused,
            },
            notes: text(p.reason),
          },
        );
      }
      return {};
    }
    case "plan.reschedule": {
      const o = get(s.occurrences, p.id, "换笼实例");
      need(o.status === "pending", "这次计划已完成或暂停");
      o.scheduledOn = date(p.date, "date");
      need(text(p.reason), "改期需要填写原因", "reason");
      o.adjustmentReason = text(p.reason);
      o.snoozedUntil = null;
      o.revision++;
      const reminder = s.reminders.find((r) => r.subjectId === o.id);
      if (reminder) reminder.snoozedUntil = null;
      event(s, type, `${get(s.cages, o.cageId).code} · 本次换笼改期`, s.today, {
        cageIds: [o.cageId],
        notes: o.adjustmentReason,
        details: {
          originalDueOn: o.originalDueOn,
          scheduledOn: o.scheduledOn,
          occurrenceId: o.id,
        },
      });
      return {};
    }
    case "cleaning.complete": {
      const selected = ids(p.cageIds);
      need(selected.length, "请勾选实际完成的笼位");
      for (const id of selected) {
        const c = activeCage(s, id),
          on = date(p.dates?.[id] || p.date, "date", s.today);
        if (
          s.events.some(
            (e) =>
              e.type === "cleaning.complete" &&
              !e.voided &&
              e.cageIds.includes(id) &&
              e.date === on,
          )
        )
          continue;
        const o = s.occurrences.find(
          (x) => x.cageId === id && ["pending", "paused"].includes(x.status),
        );
        if (p.occurrenceIds?.[id])
          need(o?.id === p.occurrenceIds[id], "计划已更新，请重新核对本次换笼");
        const older = c.lastCleanedOn && on < c.lastCleanedOn;
        const e = event(s, type, `${c.code} · 完成换笼`, on, {
          cageIds: [id],
          notes: text(p.notes),
          details: { occurrenceId: older ? null : o?.id, historical: !!older },
        });
        if (older) continue;
        c.lastCleanedOn = on;
        c.version++;
        if (o) {
          o.status = "completed";
          o.completedOn = on;
          o.eventId = e.id;
          o.revision++;
        }
        if (c.plan?.futureIntervalDays) {
          c.plan.intervalDays = c.plan.futureIntervalDays;
          delete c.plan.futureIntervalDays;
        }
        if (c.plan && !c.plan.paused && members(s, id).length)
          newOccurrence(s, c, addDays(on, c.plan.intervalDays), o?.id || e.id);
      }
      return {};
    }
    case "cleaning.correct": {
      const old = get(s.events, p.eventId);
      need(
        old.type === "cleaning.complete" && !old.voided,
        "只能更正有效的换笼记录",
      );
      need(text(p.reason), "更正需要填写原因", "reason");
      const c = get(s.cages, old.cageIds[0]);
      old.voided = true;
      if (!p.void)
        event(
          s,
          "cleaning.complete",
          `${c.code} · 更正换笼记录`,
          date(p.date, "date", s.today),
          {
            cageIds: [c.id],
            notes: text(p.reason),
            details: { corrects: old.id },
          },
        );
      const latest = s.events
        .filter(
          (e) =>
            e.type === "cleaning.complete" &&
            !e.voided &&
            e.cageIds.includes(c.id),
        )
        .sort((a, b) => b.date.localeCompare(a.date))[0];
      c.lastCleanedOn = latest?.date || null;
      c.version++;
      for (const o of s.occurrences.filter(
        (o) =>
          o.cageId === c.id &&
          (["pending", "paused"].includes(o.status) || o.eventId === old.id),
      )) {
        o.status = "cancelled";
        o.revision++;
      }
      event(s, type, `${c.code} · 更正历史`, s.today, {
        cageIds: [c.id],
        notes: text(p.reason),
        details: { eventId: old.id },
      });
      return {};
    }
    case "reminder.handle":
    case "reminder.snooze":
    case "reminder.reopen": {
      for (const id of ids(p.ids)) {
        const r = get(s.reminders, id, "提醒");
        if (type === "reminder.handle") {
          need(r.kind !== "cleaning", "换笼需要登记实际日期，不能直接标记已读");
          need(r.kind !== "care", "照护需要登记实际完成记录");
          r.status = "handled";
          r.handledAt = new Date().toISOString();
        }
        if (type === "reminder.reopen") {
          r.status = "pending";
          r.handledAt = null;
          r.basisChanged = false;
        }
        if (type === "reminder.snooze") {
          need(
            typeof p.until === "string" &&
              Number.isFinite(Date.parse(p.until)) &&
              Date.parse(p.until) > Date.now(),
            "请选择未来的再次提醒时间",
            "until",
          );
          r.snoozedUntil = p.until;
        }
      }
      return {};
    }
    case "care.plan": {
      const on = date(p.date, "date");
      need(careLabel[p.kind], "照护类型无效", "kind");
      const selected = ids(p.cageIds);
      need(selected.length, "请选择笼位");
      for (const id of selected) {
        const c = activeCage(s, id);
        if (p.mouseId)
          need(get(s.mice, p.mouseId).cageId === id, "个体不在所选笼位");
        s.careTasks.push({
          id: uid(),
          cageId: c.id,
          mouseId: p.mouseId || null,
          kind: p.kind,
          dueOn: on,
          status: "pending",
          notes: text(p.notes),
          value: null,
          eventId: null,
        });
      }
      return {};
    }
    case "care.record": {
      if (p.litterId) get(s.litters, p.litterId, "窝次");
      const on = date(p.date, "date", s.today);
      need(careLabel[p.kind], "照护类型无效", "kind");
      const selected = ids(p.cageIds);
      need(selected.length, "请选择笼位");
      const photoUrl = text(p.photoUrl, 2049);
      need(
        !photoUrl || safePhotoLink(photoUrl),
        "请填写不含用户名或密码的 HTTPS 照片链接",
        "photoUrl",
      );
      if (p.kind === "phenotype") {
        need(
          selected.length === 1 && p.mouseId,
          "请为表型观察选择一只具体小鼠",
          "mouseId",
        );
        need(text(p.notes), "请填写实际观察到的表型", "notes");
      }
      const value = p.value === "" || p.value == null ? null : Number(p.value);
      need(
        value === null ||
          (Number.isFinite(value) && value >= 0 && value <= 1000),
        "重量应为 0–1000 克",
        "value",
      );
      for (const id of selected) {
        const c = activeCage(s, id);
        const mouseIds = p.mouseId ? [get(s.mice, p.mouseId, "小鼠").id] : [];
        if (mouseIds.length)
          need(get(s.mice, mouseIds[0]).cageId === id, "个体不在所选笼位");
        const e = event(
          s,
          type,
          `${mouseIds.length ? get(s.mice, mouseIds[0]).code : c.code} · ${careLabel[p.kind]}${value !== null ? ` ${value}g` : ""}`,
          on,
          {
            cageIds: [id],
            mouseIds,
            notes: text(p.notes),
            details: {
              kind: p.kind,
              value,
              observer: text(p.observer, 80),
              photoUrl: photoUrl ? safePhotoLink(photoUrl) : "",
              experimentalFact: p.experimentalFact !== false,
            },
            litterId: p.litterId || undefined,
          },
        );
        const tasks = p.taskId
          ? [get(s.careTasks, p.taskId)]
          : s.careTasks.filter(
              (t) =>
                t.cageId === id &&
                t.kind === p.kind &&
                t.dueOn === on &&
                t.status === "pending" &&
                t.mouseId === (p.mouseId || null),
            );
        for (const t of tasks) {
          need(t.cageId === id && t.kind === p.kind, "待办与照护对象不符");
          t.status = "completed";
          t.eventId = e.id;
          t.value = value;
        }
      }
      return {};
    }
    case "breeding.create": {
      const mother = get(s.mice, p.motherId, "母鼠");
      need(
        mother.sex === "female" &&
          mother.status === "active" &&
          !mother.breedingStopped,
        "请选择在笼且可繁殖的已登记雌鼠",
        "motherId",
      );
      need(
        !s.breedings.some(
          (b) => b.motherId === mother.id && b.status !== "ended",
        ),
        "母鼠已有活动中的繁殖记录",
        "motherId",
      );
      const fathers = ids(p.candidateFatherIds || []);
      const on = date(p.date, "date", s.today);
      need(on > mother.dob, "配种日期应晚于出生日期", "date");
      const common: string[] = [];
      for (const id of fathers) {
        const f = get(s.mice, id, "候选父鼠");
        need(
          f.sex === "male" &&
            f.status === "active" &&
            !f.breedingStopped &&
            f.dob < on,
          "候选父鼠档案不符合，请复核",
          "candidateFatherIds",
        );
        common.push(...commonAncestors(s, mother.id, id));
      }
      need(
        !common.length || p.kinshipAcknowledged,
        "已登记家系存在共同祖先，请勾选确认继续",
        "kinshipAcknowledged",
      );
      const b: Breeding = {
        id: uid(),
        motherId: mother.id,
        candidateFatherIds: fathers,
        cageId: mother.cageId,
        status: "paired",
        pairedOn: on,
        observations: [],
        confirmedOn: null,
        confirmationEvidence: "",
        baselineDate: null,
        baselineValue: 0,
        convention: "",
        dueFrom: null,
        dueTo: null,
        reviewOn: optionalDate(p.reviewOn, "reviewOn"),
        endedOn: null,
        outcome: "",
        litterId: null,
        notes: text(p.notes),
        version: 1,
      };
      s.breedings.push(b);
      event(s, type, `${mother.code} · 登记配种`, on, {
        mouseIds: [mother.id, ...fathers],
        cageIds: mother.cageId ? [mother.cageId] : [],
        breedingId: b.id,
        notes: b.notes,
        details: {
          commonAncestors: [...new Set(common)],
          acknowledged: !!p.kinshipAcknowledged,
          candidateFatherIds: fathers,
          differentCages: fathers.some(
            (id) => get(s.mice, id).cageId !== mother.cageId,
          ),
        },
      });
      return { id: b.id };
    }
    case "breeding.update": {
      const b = get(s.breedings, p.id, "繁殖记录");
      need(b.status !== "ended", "繁殖记录已结束");
      const on = date(p.date || s.today, "date", s.today);
      need(on >= b.pairedOn, "日期不能早于配种日期", "date");
      const mother = get(s.mice, b.motherId);
      if (p.action === "observe") {
        need(text(p.evidence), "请填写观察依据", "evidence");
        b.observations.push({
          date: on,
          evidence: text(p.evidence),
          confidence: "observation",
        });
        if (b.status !== "confirmed") b.status = "observing";
      } else if (p.action === "confirm") {
        need(text(p.evidence), "妊娠确认需要填写依据", "evidence");
        b.status = "confirmed";
        b.confirmedOn = on;
        b.confirmationEvidence = text(p.evidence);
      } else if (p.action === "end") {
        need(text(p.outcome), "请填写过程结果", "outcome");
        b.status = "ended";
        b.endedOn = on;
        b.outcome = text(p.outcome);
      } else need(p.action === "plan", "操作无效");
      if (p.baselineDate !== undefined)
        b.baselineDate = optionalDate(p.baselineDate, "baselineDate", s.today);
      if (p.baselineValue !== undefined) {
        const value = Number(p.baselineValue);
        need(
          Number.isFinite(value) && value >= 0 && value <= 100,
          "计时值无效",
          "baselineValue",
        );
        b.baselineValue = value;
      }
      if (p.convention !== undefined) b.convention = text(p.convention, 120);
      if (p.dueFrom !== undefined)
        b.dueFrom = optionalDate(p.dueFrom, "dueFrom");
      if (p.dueTo !== undefined) b.dueTo = optionalDate(p.dueTo, "dueTo");
      need(
        (!b.dueFrom && !b.dueTo) ||
          (b.dueFrom && b.dueTo && b.dueFrom <= b.dueTo),
        "请填写完整且先后正确的预计产仔区间",
        "dueTo",
      );
      if (p.reviewOn !== undefined)
        b.reviewOn = optionalDate(p.reviewOn, "reviewOn");
      b.version++;
      event(
        s,
        type,
        `${mother.code} · ${{ observe: "登记观察 · 待确认", confirm: "人工确认妊娠", end: "结束繁殖过程", plan: "更新复核与预计窗口" }[p.action as string]}`,
        on,
        {
          mouseIds: [mother.id],
          breedingId: b.id,
          notes: text(p.evidence || p.outcome || p.notes),
          details: {
            action: p.action,
            confidence:
              p.action === "confirm"
                ? "confirmed"
                : p.action === "observe"
                  ? "observation"
                  : "registered",
            baselineDate: b.baselineDate,
            baselineValue: b.baselineValue,
            convention: b.convention,
            dueFrom: b.dueFrom,
            dueTo: b.dueTo,
          },
        },
      );
      return {};
    }
    case "litter.create": {
      const c = activeCage(s, p.cageId);
      const on = date(p.bornOn, "bornOn", s.today),
        count = integer(p.bornAlive, 0, 100, "bornAlive"),
        total = integer(p.birthTotal ?? count, count, 200, "birthTotal");
      need(
        total === count || text(p.differenceNote),
        "历史总数与当前活体不同，请填写差额说明",
        "differenceNote",
      );
      const mother = p.motherId ? get(s.mice, p.motherId, "母鼠") : undefined,
        father = p.fatherId ? get(s.mice, p.fatherId, "父鼠") : undefined;
      if (mother)
        need(
          mother.sex === "female" && mother.dob < on,
          "请复核母鼠性别与出生日期",
          "motherId",
        );
      const candidateFathers = ids(p.candidateFatherIds || []);
      candidateFathers.forEach((id) => {
        const f = get(s.mice, id);
        need(
          f.sex === "male" && f.dob < on,
          "请复核候选父鼠档案",
          "candidateFatherIds",
        );
      });
      const choice = integer(p.appearanceChoice ?? 0, 0, 2, "appearanceChoice");
      need(
        count === 0 || p.appearanceConfirmed,
        "请确认同窝外观候选后保存",
        "appearanceConfirmed",
      );
      const seed = integer(
        p.avatarSeed ?? Math.floor(Math.random() * 2 ** 30),
        0,
        2 ** 32 - 1,
        "avatarSeed",
      );
      const l: Litter = {
        id: uid(),
        code: code(p.code, s.litters),
        bornOn: on,
        dobEstimated: !!p.dobEstimated,
        cageId: c.id,
        motherId: mother?.id || null,
        fatherId: father?.id || null,
        fatherStatus:
          p.fatherStatus === "candidate" ? "candidate" : "confirmed",
        candidateFatherIds: candidateFathers,
        fosterMotherId: p.fosterMotherId || null,
        birthTotal: total,
        bornAlive: count,
        differenceNote: text(p.differenceNote),
        nursing: !!p.nursing,
        nursingEndedOn: null,
        weanDueOn: optionalDate(p.weanDueOn, "weanDueOn"),
        breedingId: p.breedingId || null,
        appearanceChoice: choice,
        notes: text(p.notes),
        version: 1,
      };
      if (l.nursing)
        need(mother || l.fosterMotherId, "请登记实际哺育母鼠", "nursing");
      if (l.fosterMotherId) {
        const f = get(s.mice, l.fosterMotherId);
        need(
          f.sex === "female" && f.dob < on,
          "请复核寄养母档案",
          "fosterMotherId",
        );
      }
      if (l.breedingId) {
        const b = get(s.breedings, l.breedingId);
        need(
          b.status !== "ended" && b.motherId === l.motherId && on >= b.pairedOn,
          "窝次与繁殖记录不符",
        );
        need(p.endBreeding !== false, "登记产仔后需要结束对应繁殖过程");
        b.status = "ended";
        b.endedOn = on;
        b.outcome = "实际产仔";
        b.litterId = l.id;
        b.version++;
      }
      s.litters.push(l);
      const newborns: Mouse[] = [];
      for (let i = 0; i < count; i++) {
        const m = makeMouse(s, {
          code: `${l.code}-P${String(i + 1).padStart(2, "0")}`,
          dob: on,
          dobEstimated: l.dobEstimated,
          cageId: c.id,
          sex: "unknown",
          motherId: l.motherId,
          fatherId: l.fatherId,
          fatherStatus: l.fatherStatus,
          fosterMotherId: l.fosterMotherId,
          weaningStatus: p.weaningStatus || "unweaned",
          avatarSeed: seed + i * 107,
        });
        m.birthLitterId = l.id;
        m.appearance = litterAppearance(
          seed,
          i,
          mother?.appearance,
          father && l.fatherStatus === "confirmed"
            ? father.appearance
            : undefined,
          choice,
        );
        m.appearanceLocked = true;
        s.mice.push(m);
        newborns.push(m);
      }
      capacity(s, c.id, p.capacityReason);
      event(s, type, `${l.code} · 登记 ${count} 只幼鼠`, on, {
        cageIds: [c.id],
        mouseIds: [
          ...newborns.map((m) => m.id),
          ...(mother ? [mother.id] : []),
        ],
        litterId: l.id,
        breedingId: l.breedingId || undefined,
        notes: text(p.notes || p.capacityReason),
        details: {
          bornAlive: count,
          birthTotal: total,
          appearanceChoice: choice,
          priorBreedingRegistered: !!l.breedingId,
        },
      });
      return { id: l.id };
    }
    case "litter.update": {
      const l = get(s.litters, p.id),
        old = structuredClone(l);
      need(text(p.reason), "窝次更正需要填写原因", "reason");
      if (p.bornOn !== undefined) l.bornOn = date(p.bornOn, "bornOn", s.today);
      if (p.motherId !== undefined) l.motherId = p.motherId || null;
      if (p.fosterMotherId !== undefined)
        l.fosterMotherId = p.fosterMotherId || null;
      if (p.weanDueOn !== undefined)
        l.weanDueOn = optionalDate(p.weanDueOn, "weanDueOn");
      if (p.nursing !== undefined) {
        l.nursing = !!p.nursing;
        l.nursingEndedOn = l.nursing
          ? null
          : date(p.date || s.today, "date", s.today);
      }
      for (const m of s.mice.filter((m) => m.birthLitterId === l.id)) {
        m.dob = l.bornOn;
        m.motherId = l.motherId;
        m.fosterMotherId = l.fosterMotherId;
        if (m.weanedOn)
          need(m.weanedOn >= m.dob, "更正后的生日晚于实际断奶日期");
        m.version++;
      }
      if (l.motherId)
        need(
          get(s.mice, l.motherId).sex === "female",
          "母鼠性别不符",
          "motherId",
        );
      if (l.fosterMotherId) {
        const foster = get(s.mice, l.fosterMotherId, "寄养母");
        need(
          foster.sex === "female" && foster.dob < l.bornOn,
          "请复核寄养母档案",
          "fosterMotherId",
        );
      }
      need(
        !l.nursing || l.motherId || l.fosterMotherId,
        "哺乳中需要登记实际哺育母鼠",
        "nursing",
      );
      validateAllParents(s);
      l.version++;
      event(s, type, `${l.code} · 更正窝次记录`, s.today, {
        litterId: l.id,
        mouseIds: s.mice
          .filter((m) => m.birthLitterId === l.id)
          .map((m) => m.id),
        notes: text(p.reason),
        details: { old, current: l },
      });
      return {};
    }
    case "settings.update": {
      const old = structuredClone(s.settings);
      const next = { ...s.settings };
      if (p.timezone !== undefined) {
        try {
          new Intl.DateTimeFormat("en", { timeZone: p.timezone }).format();
        } catch {
          throw new DomainError("时区无效", "timezone");
        }
        next.timezone = p.timezone;
      }
      if (p.defaultCapacity !== undefined)
        next.defaultCapacity = integer(
          p.defaultCapacity,
          1,
          500,
          "defaultCapacity",
        );
      if (p.defaultIntervalDays !== undefined)
        next.defaultIntervalDays = integer(
          p.defaultIntervalDays,
          1,
          365,
          "defaultIntervalDays",
        );
      for (const k of ["reminderTime", "quietStart", "quietEnd"] as const)
        if (p[k] !== undefined) {
          need(/^([01]\d|2[0-3]):[0-5]\d$/.test(p[k]), "时间无效", k);
          next[k] = p[k];
        }
      if (p.motion !== undefined) {
        need(
          ["full", "gentle", "static"].includes(p.motion),
          "动效选项无效",
          "motion",
        );
        next.motion = p.motion;
      }
      for (const k of [
        "stories",
        "personalities",
        "anniversaries",
        "pushEnabled",
      ] as const)
        if (p[k] !== undefined) next[k] = !!p[k];
      s.settings = next;
      event(s, type, "更新小窝设置", s.today, {
        details: { old, current: next },
      });
      return {};
    }
    default:
      throw new DomainError("不支持的操作", "type", 400);
  }
}
