import { useEffect, useMemo, useState } from "react";
import {
  Bell,
  CalendarDays,
  Settings,
  Search,
  Plus,
  House,
  Mouse as MouseIcon,
  Pause,
  Play,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
  Droplets,
  Sprout,
  Heart,
  ArrowLeft,
  SlidersHorizontal,
  Check,
  X,
  Leaf,
} from "lucide-react";
import { useApp } from "./context";
import type { Cage, Mouse } from "../shared/types";
import { purposeLabel, sexLabel } from "../shared/types";
import {
  ageText,
  daysBetween,
  dateLabel,
  shortDate,
  addDays,
} from "../shared/dates";
import {
  actionable,
  cageMembers,
  currentOccurrence,
  mouseMatches,
  mouseTags,
} from "./selectors";
import { Badge, Empty, MouseRow } from "./components/Primitives";
import { CageScene, MouseSprite } from "./components/MouseSprite";
import { Panels } from "./components/Panels";
import { Calendar } from "./components/Calendar";
import { AdminEntry } from "./environment";

function CageCard({
  cage,
  index,
  matches,
}: {
  cage: Cage;
  index: number;
  matches: string[];
}) {
  const { state, open } = useApp(),
    [selected, setSelected] = useState(""),
    members = cageMembers(state, cage.id),
    occ = currentOccurrence(state, cage.id),
    overflow = members.length > cage.capacity;
  const overdue = occ?.status === "pending" && occ.originalDueOn < state.today;
  const dateText = !cage.plan
    ? "未设换笼计划"
    : cage.plan.paused
      ? "换笼已暂停"
      : occ?.status === "pending"
        ? `${dateLabel(occ.scheduledOn, state.today)}换笼`
        : "待复核计划";
  const babies = members.filter((m) => m.weaningStatus === "unweaned");
  const adults = members.filter((m) => m.weaningStatus !== "unweaned");
  const displayed =
    babies.length > 2 ? [...adults.slice(0, 2)] : members.slice(0, 3);
  return (
    <article className={`cage-card ${overflow ? "over-capacity" : ""}`}>
      <header className="cage-card-head">
        <button
          className="cage-title"
          onClick={() => open({ kind: "cage", id: cage.id })}
        >
          <strong>{cage.code}</strong>
          <span>{cage.nickname || purposeLabel[cage.purpose]}</span>
          <ChevronRight size={15} />
        </button>
        <div className="cage-capacity-wrap">
          <span
            className={`occupancy ${overflow ? "warning" : ""}`}
            title="全部在笼活体数量，包括未断奶幼鼠"
          >
            {members.length}
            <span> / {cage.capacity}</span>
            <MouseIcon size={14} />
          </span>
          <div
            className={`capacity-bar ${overflow ? "overflow" : ""}`}
            aria-hidden="true"
          >
            <div
              className="capacity-fill"
              style={{
                width: `${Math.min(100, (members.length / cage.capacity) * 100)}%`,
              }}
            />
          </div>
        </div>
      </header>
      <CageScene
        cage={cage}
        index={index}
        onSelect={setSelected}
        highlightIds={matches}
      />
      <div className="cage-members">
        {displayed.map((m) => (
          <MouseRow
            key={m.id}
            mouse={m}
            highlight={selected === m.id || matches.includes(m.id)}
          />
        ))}
        {babies.length > 2 && (
          <button
            className="litter-member-row"
            onClick={() =>
              open({ kind: "litter", id: babies[0].birthLitterId! })
            }
          >
            <span className="baby-stack">
              {babies.slice(0, 3).map((m) => (
                <MouseSprite key={m.id} mouse={m} pose="baby" />
              ))}
            </span>
            <strong>
              {state.litters.find((l) => l.id === babies[0].birthLitterId)
                ?.code || "幼鼠"}
              <span> · {babies.length} 只幼鼠</span>
            </strong>
            <Badge tone="lilac">
              {daysBetween(babies[0].dob, state.today)} 日龄
            </Badge>
            <ChevronRight size={14} />
          </button>
        )}
        {!members.length && (
          <div className="empty-members">
            <Sprout size={16} />
            <span>小窝空着，等一位新住客</span>
          </div>
        )}
        {members.length >
          displayed.length + (babies.length > 2 ? babies.length : 0) && (
          <button
            className="more-members"
            onClick={() => open({ kind: "cage", id: cage.id })}
          >
            查看全部 {members.length} 位成员 <ChevronRight size={13} />
          </button>
        )}
      </div>
      <footer className="cage-card-foot">
        <button
          className={`next-date ${overdue ? "overdue" : ""}`}
          onClick={() => open({ kind: "cage", id: cage.id })}
        >
          {overdue ? (
            <span className="status-dot amber" />
          ) : (
            <CalendarDays size={14} />
          )}
          <span>
            {overdue
              ? `原应换日已过 ${daysBetween(occ!.originalDueOn, state.today)} 天`
              : dateText}
          </span>
        </button>
        <button
          className="clean-button"
          onClick={() => open({ kind: "clean", data: { cageIds: [cage.id] } })}
        >
          记录换笼 <ArrowUpRight size={13} />
        </button>
      </footer>
      {overflow && (
        <div className="overflow-note">
          {members.length}/{cage.capacity} · 超出{" "}
          {members.length - cage.capacity} 只
        </div>
      )}
    </article>
  );
}
export default function App() {
  const { state, open, command, toast } = useApp();
  const [view, setView] = useState<"cages" | "mice">(() =>
      localStorage.getItem("nook-view") === "mice" ? "mice" : "cages",
    ),
    [calendar, setCalendar] = useState(false),
    [query, setQuery] = useState(""),
    [purpose, setPurpose] = useState(""),
    [reproductive, setReproductive] = useState(""),
    [filterOpen, setFilterOpen] = useState(false),
    [sex, setSex] = useState(""),
    [genotype, setGenotype] = useState(""),
    [cageFilter, setCageFilter] = useState(""),
    [archived, setArchived] = useState(false),
    [ageMin, setAgeMin] = useState(""),
    [ageMax, setAgeMax] = useState(""),
    [sort, setSort] = useState("code"),
    [onlyReminder, setOnlyReminder] = useState(false),
    [page, setPage] = useState(1),
    [addOpen, setAddOpen] = useState(false),
    [summary, setSummary] = useState(true),
    [selected, setSelected] = useState<string[]>([]);
  const reminders = state.reminders.filter((r) => actionable(state, r)),
    todayTasks = state.careTasks.filter(
      (t) => t.dueOn === state.today && t.status === "pending",
    ),
    cleanTasks = state.occurrences.filter(
      (o) => o.status === "pending" && o.scheduledOn <= state.today,
    ),
    careCount = todayTasks.length + cleanTasks.length;
  const activeMice = state.mice.filter((m) => m.status === "active"),
    cages = state.cages.filter((c) => !c.archived);
  useEffect(() => {
    localStorage.setItem("nook-view", view);
  }, [view]);
  useEffect(() => {
    if (!localStorage.getItem("nook-intro")) {
      localStorage.setItem("nook-intro", "seen");
      toast("鼠鼠动作是趣味演绎，档案状态以登记为准");
    }
  }, []);
  useEffect(() => {
    setPage(1);
    setSelected([]);
  }, [
    query,
    purpose,
    reproductive,
    sex,
    genotype,
    cageFilter,
    archived,
    ageMin,
    ageMax,
    sort,
    onlyReminder,
    view,
  ]);
  useEffect(() => {
    const p = new URLSearchParams(location.search);
    if (p.get("panel") === "reminders") open({ kind: "reminders" });
  }, []);
  const matching = useMemo(
    () =>
      state.mice
        .filter((m) => {
          if (!archived && m.status !== "active") return false;
          if (query && !mouseMatches(state, m, query)) return false;
          if (
            (sex && m.sex !== sex) ||
            (genotype &&
              (genotype === "__unknown"
                ? !!m.genotype
                : m.genotype !== genotype)) ||
            (cageFilter && m.cageId !== cageFilter)
          )
            return false;
          if (
            purpose &&
            state.cages.find((c) => c.id === m.cageId)?.purpose !== purpose
          )
            return false;
          const age = daysBetween(m.dob, state.today);
          if (
            (ageMin && age < Number(ageMin) * 7) ||
            (ageMax && age > Number(ageMax) * 7)
          )
            return false;
          if (onlyReminder && !reminders.some((r) => r.subjectId === m.id))
            return false;
          if (reproductive === "unweaned" && m.weaningStatus !== "unweaned")
            return false;
          if (
            reproductive &&
            reproductive !== "unweaned" &&
            !mouseTags(state, m).some((t) => t.label === reproductive)
          )
            return false;
          return true;
        })
        .sort((a, b) =>
          sort === "age"
            ? daysBetween(a.dob, state.today) -
                daysBetween(b.dob, state.today) ||
              a.code.localeCompare(b.code, undefined, { numeric: true })
            : sort === "cage"
              ? (
                  state.cages.find((c) => c.id === a.cageId)?.code || ""
                ).localeCompare(
                  state.cages.find((c) => c.id === b.cageId)?.code || "",
                  undefined,
                  { numeric: true },
                ) || a.code.localeCompare(b.code, undefined, { numeric: true })
              : a.code.localeCompare(b.code, undefined, { numeric: true }),
        ),
    [
      state,
      query,
      purpose,
      sex,
      genotype,
      cageFilter,
      reproductive,
      archived,
      ageMin,
      ageMax,
      sort,
      onlyReminder,
    ],
  );
  const hasIndividualFilter = !!(
    query ||
    reproductive ||
    sex ||
    genotype ||
    ageMin ||
    ageMax ||
    onlyReminder
  );
  const filteredCages = cages.filter(
    (c) =>
      (!purpose || c.purpose === purpose) &&
      (!cageFilter || c.id === cageFilter) &&
      (!hasIndividualFilter ||
        matching.some((m) => m.cageId === c.id) ||
        (!!query &&
          [c.code, c.nickname].some((v) =>
            v.toLowerCase().includes(query.toLowerCase()),
          ) &&
          !reproductive &&
          !sex &&
          !genotype &&
          !ageMin &&
          !ageMax &&
          !onlyReminder)),
  );
  const visible = view === "cages" ? filteredCages : matching;
  const pages = Math.max(
      1,
      Math.ceil(visible.length / (view === "cages" ? 12 : 30)),
    ),
    safePage = Math.min(page, pages);
  const clear = () => {
    setQuery("");
    setPurpose("");
    setReproductive("");
    setSex("");
    setGenotype("");
    setCageFilter("");
    setAgeMin("");
    setAgeMax("");
    setOnlyReminder(false);
    setArchived(false);
  };
  const motion = state.settings.motion !== "static";
  const toggleMotion = () => {
    void command("settings.update", {
      motion: motion ? "static" : "full",
    }).catch((e) => toast(e.message));
  };
  const birthday = state.settings.anniversaries
    ? activeMice.find(
        (m) => m.dob.slice(5) === state.today.slice(5) && m.dob < state.today,
      )
    : undefined;
  const recent = state.events
    .filter(
      (e) => e.type === "care.record" && e.date === state.today && !e.voided,
    )
    .at(-1);
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <button
            className="brand"
            onClick={() => setCalendar(false)}
            aria-label="鼠鼠小窝首页"
          >
            <span className="brand-mark">
              <MouseSprite />
            </span>
            <span>
              <strong>鼠鼠小窝</strong>
              <small>MOUSE NOOK</small>
            </span>
          </button>
          <div className="global-search">
            <Search size={18} />
            <input
              aria-label="搜索小鼠或笼位"
              placeholder="寻找一只鼠鼠、一个小窝…"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setCalendar(false);
              }}
            />
            {query ? (
              <button aria-label="清除搜索" onClick={() => setQuery("")}>
                <X size={15} />
              </button>
            ) : (
              <kbd>⌕</kbd>
            )}
          </div>
          <nav className="top-actions">
            <button
              aria-label="换笼日历"
              className={`calendar-entry ${calendar ? "active" : ""}`}
              onClick={() => setCalendar((v) => !v)}
            >
              <CalendarDays size={19} />
              <span>换笼日历</span>
            </button>
            <button
              className="icon-button notification-button"
              aria-label={`提醒，${reminders.length} 项待处理`}
              onClick={() => open({ kind: "reminders" })}
            >
              <Bell size={20} />
              {reminders.length > 0 && (
                <span className="notification-count">{reminders.length}</span>
              )}
            </button>
            <span className="top-divider" />
            <button
              className="icon-button"
              aria-label="设置"
              onClick={() => open({ kind: "settings" })}
            >
              <Settings size={20} />
            </button>
            <AdminEntry />
          </nav>
        </div>
      </header>
      <main className="workspace">
        {calendar ? (
          <Calendar onBack={() => setCalendar(false)} />
        ) : (
          <>
            <section className="welcome">
              <div>
                <div className="eyebrow">
                  <span className="tiny-flower">✿</span>
                  {new Date(state.today + "T12:00:00").toLocaleDateString(
                    "zh-CN",
                    { month: "long", day: "numeric", weekday: "long" },
                  )}
                  {state.demo && <span className="demo-label">示例小窝</span>}
                </div>
                <h1>
                  小小的日常，<span>暖暖的小窝。</span>
                </h1>
                <p>每一只都被记得，每一天都被好好照顾。</p>
              </div>
              <div className="welcome-stats">
                <div>
                  <strong>{activeMice.length}</strong>
                  <span>只小鼠</span>
                </div>
                <span className="stat-divider" />
                <div>
                  <strong>{cages.length}</strong>
                  <span>个小窝</span>
                </div>
                <MouseSprite
                  mouse={activeMice.find((m) => m.appearance.coat === "cream")}
                  pose="sleep"
                  className="welcome-mouse"
                />
                <span className="welcome-z" aria-hidden="true">
                  z z
                </span>
              </div>
            </section>
            <div className="mobile-search">
              <Search size={17} />
              <input
                aria-label="搜索小鼠或笼位"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="编号、昵称、基因型、笼号…"
              />
              {query && (
                <button aria-label="清除搜索" onClick={() => setQuery("")}>
                  <X size={15} />
                </button>
              )}
            </div>
            <section className="today-strip">
              <button
                className="today-label"
                onClick={() => setSummary((v) => !v)}
              >
                <span className="today-icon">
                  <Leaf size={19} />
                </span>
                <strong>今日小窝</strong>
                <ChevronDown size={14} className={summary ? "" : "rotate"} />
              </button>
              {summary && (
                <>
                  <button
                    className="today-item"
                    onClick={() => open({ kind: "care" })}
                  >
                    <Droplets size={16} />
                    <span>照护待办</span>
                    <b>{careCount}</b>
                  </button>
                  <span className="strip-divider" />
                  <button
                    className="today-item"
                    onClick={() =>
                      open({ kind: "reminders", data: { tab: "upcoming" } })
                    }
                  >
                    <Heart size={16} />
                    <span>繁育关注</span>
                    <b>
                      {
                        state.breedings.filter((b) => b.status !== "ended")
                          .length
                      }
                    </b>
                  </button>
                  {state.settings.stories && recent && (
                    <>
                      <span className="strip-divider story-divider" />
                      <button
                        className="today-story"
                        onClick={() =>
                          open({ kind: "cage", id: recent.cageIds[0] })
                        }
                      >
                        <span className="story-dot" />
                        {recent.title.replace(" · ", " 已记录")}
                        <ChevronRight size={13} />
                      </button>
                    </>
                  )}
                  {birthday && (
                    <button
                      className="birthday-item"
                      onClick={() => open({ kind: "mouse", id: birthday.id })}
                    >
                      ✿ {birthday.code} 的生日
                    </button>
                  )}
                  <button
                    className="strip-link"
                    onClick={() => open({ kind: "care" })}
                  >
                    看看今天 <ArrowUpRight size={15} />
                  </button>
                </>
              )}
            </section>
            <div className="view-toolbar">
              <div className="view-tabs" aria-label="管理视图">
                <button
                  className={view === "cages" ? "active" : ""}
                  onClick={() => setView("cages")}
                >
                  <House size={17} />
                  鼠笼<span>{cages.length}</span>
                </button>
                <button
                  className={view === "mice" ? "active" : ""}
                  onClick={() => setView("mice")}
                >
                  <MouseIcon size={17} />
                  小鼠<span>{activeMice.length}</span>
                </button>
              </div>
              <div className="filters">
                <select
                  aria-label="按用途筛选"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                >
                  <option value="">全部笼位</option>
                  {Object.entries(purposeLabel).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <select
                  aria-label="繁殖状态筛选"
                  value={reproductive}
                  onChange={(e) => setReproductive(e.target.value)}
                >
                  <option value="">全部状态</option>
                  {["配种中", "待确认", "妊娠已确认", "哺乳中"].map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                  <option value="unweaned">未断奶</option>
                </select>
                <button
                  className={`icon-button filter-button ${filterOpen ? "active" : ""}`}
                  aria-label="更多筛选"
                  onClick={() => setFilterOpen((v) => !v)}
                >
                  <SlidersHorizontal size={17} />
                </button>
                <span className="filter-divider" />
                <button
                  className={`motion-toggle ${motion ? "on" : ""}`}
                  onClick={toggleMotion}
                  aria-label={motion ? "暂停动画" : "开启动画"}
                >
                  {motion ? <Pause size={13} /> : <Play size={13} />}
                  <span>动画{motion ? "开" : "关"}</span>
                  <span className="switch-track">
                    <i />
                  </span>
                </button>
              </div>
            </div>
            {filterOpen && (
              <div className="advanced-filters">
                <label className="mobile-state-filter">
                  繁育状态
                  <select
                    value={reproductive}
                    onChange={(e) => setReproductive(e.target.value)}
                  >
                    <option value="">全部状态</option>
                    {["配种中", "待确认", "妊娠已确认", "哺乳中"].map((v) => (
                      <option key={v}>{v}</option>
                    ))}
                    <option value="unweaned">未断奶</option>
                  </select>
                </label>
                <label>
                  性别
                  <select value={sex} onChange={(e) => setSex(e.target.value)}>
                    <option value="">全部</option>
                    {Object.entries(sexLabel).map(([k, v]) => (
                      <option value={k} key={k}>
                        {v}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  基因型
                  <select
                    value={genotype}
                    onChange={(e) => setGenotype(e.target.value)}
                  >
                    <option value="">全部</option>
                    {[...new Set(state.mice.map((m) => m.genotype))].map(
                      (v) => (
                        <option value={v || "__unknown"} key={v}>
                          {v || "待鉴定"}
                        </option>
                      ),
                    )}
                  </select>
                </label>
                <label>
                  笼位
                  <select
                    value={cageFilter}
                    onChange={(e) => setCageFilter(e.target.value)}
                  >
                    <option value="">全部</option>
                    {cages.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  周龄
                  <input
                    aria-label="最小周龄"
                    type="number"
                    min="0"
                    value={ageMin}
                    onChange={(e) => setAgeMin(e.target.value)}
                    placeholder="从"
                  />
                </label>
                <label>
                  至
                  <input
                    aria-label="最大周龄"
                    type="number"
                    min="0"
                    value={ageMax}
                    onChange={(e) => setAgeMax(e.target.value)}
                    placeholder="不限"
                  />
                </label>
                <label>
                  排序
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="code">编号</option>
                    <option value="age">周龄</option>
                    <option value="cage">笼位</option>
                  </select>
                </label>
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={onlyReminder}
                    onChange={(e) => setOnlyReminder(e.target.checked)}
                  />
                  有到期提醒
                </label>
                {view === "mice" && (
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={archived}
                      onChange={(e) => setArchived(e.target.checked)}
                    />
                    包含归档
                  </label>
                )}
                <button className="text-button" onClick={clear}>
                  重置
                </button>
              </div>
            )}
            <div className="results-line">
              <span>
                {query ? `“${query}” · ` : ""}
                {view === "cages"
                  ? `${filteredCages.length} 个小窝`
                  : `${matching.length} 只小鼠`}
                {hasIndividualFilter ? "符合筛选" : ""}
              </span>
              <span className="scene-note">
                <span className="status-dot sage" />
                {motion ? "小窝生活进行中" : "小窝静静休息中"}
                <button
                  aria-label="关于鼠鼠动作"
                  onClick={() => open({ kind: "motionInfo" })}
                >
                  ⓘ
                </button>
              </span>
            </div>
            {visible.length === 0 ? (
              <Empty
                title={cages.length ? "没有找到这位小住客" : "欢迎来到鼠鼠小窝"}
                text={
                  cages.length
                    ? "试试别的编号、昵称或笼号。"
                    : "从一个小窝开始，记录每一只鼠鼠的日常。"
                }
                action={
                  <button
                    className="button primary"
                    onClick={
                      cages.length ? clear : () => open({ kind: "cageForm" })
                    }
                  >
                    {cages.length ? "清除筛选" : "添加第一个笼位"}
                  </button>
                }
              />
            ) : view === "cages" ? (
              <div className="cage-grid">
                {filteredCages
                  .slice((safePage - 1) * 12, safePage * 12)
                  .map((c, i) => (
                    <CageCard
                      key={c.id}
                      cage={c}
                      index={i}
                      matches={
                        hasIndividualFilter
                          ? matching
                              .filter((m) => m.cageId === c.id)
                              .map((m) => m.id)
                          : []
                      }
                    />
                  ))}
              </div>
            ) : (
              <div className="mouse-table-wrap">
                {selected.length > 0 && (
                  <div className="selection-toolbar">
                    <strong>已选 {selected.length} 只</strong>
                    <button
                      className="button small"
                      onClick={() =>
                        open({ kind: "transfer", data: { mouseIds: selected } })
                      }
                    >
                      转笼
                    </button>
                    <button
                      className="button small"
                      onClick={() =>
                        open({ kind: "wean", data: { mouseIds: selected } })
                      }
                    >
                      登记断奶
                    </button>
                    <button
                      className="text-button"
                      onClick={() => setSelected([])}
                    >
                      清空选择
                    </button>
                  </div>
                )}
                <table className="mouse-table">
                  <thead>
                    <tr>
                      <th>
                        <input
                          aria-label="选择本页全部小鼠"
                          type="checkbox"
                          checked={
                            matching.slice((safePage - 1) * 30, safePage * 30)
                              .length > 0 &&
                            matching
                              .slice((safePage - 1) * 30, safePage * 30)
                              .every((m) => selected.includes(m.id))
                          }
                          onChange={(e) =>
                            setSelected(
                              e.target.checked
                                ? matching
                                    .slice((safePage - 1) * 30, safePage * 30)
                                    .map((m) => m.id)
                                : [],
                            )
                          }
                        />
                      </th>
                      {[
                        "小鼠",
                        "基因型",
                        "性别",
                        "周龄",
                        "笼位",
                        "状态",
                        "提醒",
                      ].map((x) => (
                        <th key={x}>{x}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {matching
                      .slice((safePage - 1) * 30, safePage * 30)
                      .map((m) => (
                        <tr key={m.id}>
                          <td>
                            <input
                              aria-label={`选择 ${m.code}`}
                              type="checkbox"
                              checked={selected.includes(m.id)}
                              onChange={(e) =>
                                setSelected((v) =>
                                  e.target.checked
                                    ? [...v, m.id]
                                    : v.filter((id) => id !== m.id),
                                )
                              }
                            />
                          </td>
                          <td>
                            <button
                              className="table-mouse"
                              onClick={() => open({ kind: "mouse", id: m.id })}
                            >
                              <MouseSprite mouse={m} />
                              <span>
                                <strong>{m.code}</strong>
                                <small>{m.nickname}</small>
                              </span>
                            </button>
                          </td>
                          <td>
                            <Badge tone="neutral">
                              {m.genotype || "待鉴定"}
                            </Badge>
                          </td>
                          <td>{sexLabel[m.sex]}</td>
                          <td>{ageText(m.dob, state.today, m.dobEstimated)}</td>
                          <td>
                            <button
                              className="text-button"
                              onClick={() =>
                                m.cageId && open({ kind: "cage", id: m.cageId })
                              }
                            >
                              {state.cages.find((c) => c.id === m.cageId)
                                ?.code || "—"}
                            </button>
                          </td>
                          <td>
                            {mouseTags(state, m).map((tag, i) => (
                              <Badge key={i} tone={tag.tone}>
                                {tag.label}
                              </Badge>
                            ))}
                          </td>
                          <td>
                            {reminders.some((r) => r.subjectId === m.id) ? (
                              <button
                                className="reminder-pill"
                                onClick={() => open({ kind: "reminders" })}
                              >
                                <Bell size={13} />
                                待处理
                              </button>
                            ) : (
                              <span className="muted">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            )}
            {pages > 1 && (
              <nav className="pagination" aria-label="分页">
                <button
                  className="button"
                  disabled={safePage === 1}
                  onClick={() => setPage(safePage - 1)}
                >
                  上一页
                </button>
                <span>
                  {safePage} / {pages}
                </span>
                <button
                  className="button"
                  disabled={safePage === pages}
                  onClick={() => setPage(safePage + 1)}
                >
                  下一页
                </button>
              </nav>
            )}
            <footer className="page-footer">
              <span className="footer-flower">✿</span> 把小小的生命，放在心上。
            </footer>
          </>
        )}
      </main>
      {!calendar && (
        <div className="add-dock">
          {addOpen && (
            <div className="add-menu">
              {[
                ["mouseForm", "新增小鼠", MouseIcon],
                ["cageForm", "新增笼位", House],
                ["litterForm", "登记一窝", Heart],
              ].map(([kind, label, Icon]: any) => (
                <button
                  key={kind}
                  onClick={() => {
                    open({ kind });
                    setAddOpen(false);
                  }}
                >
                  <Icon size={18} />
                  {label}
                  <ChevronRight size={14} />
                </button>
              ))}
            </div>
          )}
          <button
            className="add-button"
            aria-expanded={addOpen}
            onClick={() => setAddOpen((v) => !v)}
          >
            <Plus size={21} className={addOpen ? "rotate-45" : ""} />
            新增
          </button>
        </div>
      )}
      <nav className="mobile-tabbar" aria-label="主导航">
        <button
          className={!calendar && view === "cages" ? "active" : ""}
          onClick={() => {
            setView("cages");
            setCalendar(false);
          }}
        >
          <House size={22} />
          <span>小窝</span>
        </button>
        <button
          className={!calendar && view === "mice" ? "active" : ""}
          onClick={() => {
            setView("mice");
            setCalendar(false);
          }}
        >
          <MouseIcon size={22} />
          <span>小鼠</span>
        </button>
        <button
          className={calendar ? "active" : ""}
          onClick={() => setCalendar((v) => !v)}
        >
          <CalendarDays size={22} />
          <span>日历</span>
        </button>
        <button onClick={() => open({ kind: "reminders" })}>
          <span className="tab-notif">
            <Bell size={22} />
            {reminders.length > 0 && (
              <span className="notification-count">{reminders.length}</span>
            )}
          </span>
          <span>提醒</span>
        </button>
      </nav>
      <Panels />
    </>
  );
}
