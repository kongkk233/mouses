import { SPRITE_VERSION } from "../../shared/generated-assets";
import { useMemo, useState } from "react";
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  List,
  Check,
  Clock3,
} from "lucide-react";
import { useApp } from "../context";
import {
  addDays,
  dateNumber,
  daysBetween,
  shortDate,
} from "../../shared/dates";
import { cageMembers, currentOccurrence } from "../selectors";
import { Badge, Empty } from "./Primitives";
interface Item {
  id: string;
  cageId: string;
  date: string;
  kind: "pending" | "completed" | "predicted";
  original?: string;
  title: string;
}
export function Calendar({ onBack }: { onBack: () => void }) {
  const { state, open } = useApp(),
    [month, setMonth] = useState(state.today.slice(0, 7) + "-01"),
    [selectedDay, setSelectedDay] = useState(state.today),
    [view, setView] = useState(window.innerWidth < 760 ? "list" : "month"),
    [filter, setFilter] = useState(""),
    [selected, setSelected] = useState<string[]>([]);
  const year = Number(month.slice(0, 4)),
    mon = Number(month.slice(5, 7));
  const firstWeek = (new Date(month + "T00:00:00Z").getUTCDay() + 6) % 7,
    start = addDays(month, -firstWeek),
    end = addDays(start, 41);
  const move = (n: number) => {
    const d = new Date(Date.UTC(year, mon - 1 + n, 1))
      .toISOString()
      .slice(0, 10);
    setMonth(d);
    setSelectedDay(d);
    setSelected([]);
  };
  const items = useMemo(() => {
    const result: Item[] = [];
    for (const o of state.occurrences.filter((o) => o.status === "pending")) {
      const c = state.cages.find((c) => c.id === o.cageId)!;
      result.push({
        id: o.id,
        cageId: c.id,
        date: o.scheduledOn,
        kind: "pending",
        original: o.originalDueOn,
        title: c.code,
      });
      if (c.plan && !c.plan.paused) {
        let d = addDays(
            o.scheduledOn,
            c.plan.futureIntervalDays || c.plan.intervalDays,
          ),
          count = 0;
        while (d <= end && count++ < 1000) {
          if (d >= start)
            result.push({
              id: `prediction:${o.id}:${d}`,
              cageId: c.id,
              date: d,
              kind: "predicted",
              title: c.code,
            });
          d = addDays(d, c.plan.futureIntervalDays || c.plan.intervalDays);
        }
      }
    }
    for (const e of state.events.filter(
      (e) => e.type === "cleaning.complete" && !e.voided,
    )) {
      const c = state.cages.find((c) => c.id === e.cageIds[0]);
      if (c)
        result.push({
          id: e.id,
          cageId: c.id,
          date: e.date,
          kind: "completed",
          title: c.code,
        });
    }
    for (const t of state.careTasks) {
      if (t.dueOn >= start && t.dueOn <= end) {
        /* care is shown in the selected-day agenda below */
      }
    }
    return result
      .filter((i) =>
        !filter || filter === "unplanned"
          ? !filter || !state.cages.find((c) => c.id === i.cageId)?.plan
          : i.cageId === filter,
      )
      .sort(
        (a, b) =>
          a.date.localeCompare(b.date) || a.title.localeCompare(b.title),
      );
  }, [state, start, end, filter]);
  const overdue = state.occurrences.filter(
    (o) =>
      o.status === "pending" &&
      o.originalDueOn < state.today &&
      (!filter || filter === o.cageId),
  );
  const dayItems = items.filter((i) => i.date === selectedDay),
    dayTasks = state.careTasks.filter(
      (t) =>
        t.dueOn === selectedDay &&
        t.status !== "cancelled" &&
        (!filter || filter === t.cageId),
    ),
    careEvents = state.events.filter(
      (e) =>
        e.type === "care.record" &&
        e.date === selectedDay &&
        (!filter || e.cageIds.includes(filter)),
    );
  const selectedRows = items.filter(
    (i) => selected.includes(i.id) && i.kind === "pending",
  );
  const openItem = (item: Item) =>
    item.kind === "pending"
      ? open({ kind: "occurrence", id: item.id })
      : open({ kind: "cage", id: item.cageId });
  return (
    <section className="calendar-workspace">
      <div className="calendar-heading">
        <div>
          <button className="back-link" onClick={onBack}>
            <ArrowLeft size={16} />
            回到小窝
          </button>
          <h1>
            换笼日历<span>把照护安排好。</span>
          </h1>
        </div>
        <button className="button" onClick={() => open({ kind: "plan" })}>
          设置换笼计划
        </button>
      </div>
      <div className="calendar-toolbar">
        <div className="row gap-12">
          <button
            className="icon-button"
            aria-label="上个月"
            onClick={() => move(-1)}
          >
            <ChevronLeft size={20} />
          </button>
          <h2>
            {year}
            <small>年</small> {mon}
            <small>月</small>
          </h2>
          <button
            className="icon-button"
            aria-label="下个月"
            onClick={() => move(1)}
          >
            <ChevronRight size={20} />
          </button>
          <button
            className="button small"
            onClick={() => {
              setMonth(state.today.slice(0, 7) + "-01");
              setSelectedDay(state.today);
            }}
          >
            今天
          </button>
        </div>
        <div className="row gap-12">
          <select
            aria-label="日历笼位筛选"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">全部笼位</option>
            <option value="unplanned">未设计划</option>
            {state.cages
              .filter((c) => !c.archived)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.code}
                </option>
              ))}
          </select>
          <div className="segmented">
            <button
              className={view === "month" ? "active" : ""}
              onClick={() => setView("month")}
            >
              <CalendarDays size={15} />
              月历
            </button>
            <button
              className={view === "list" ? "active" : ""}
              onClick={() => setView("list")}
            >
              <List size={15} />
              日程
            </button>
          </div>
        </div>
      </div>
      {overdue.length > 0 && (
        <div className="overdue-banner">
          <Clock3 size={18} />
          <strong>{overdue.length} 个小窝已过原应换日</strong>
          <span>
            最早{" "}
            {shortDate(
              [...overdue].sort((a, b) =>
                a.originalDueOn.localeCompare(b.originalDueOn),
              )[0].originalDueOn,
            )}
          </span>
          <button
            onClick={() =>
              open({
                kind: "clean",
                data: { cageIds: overdue.map((o) => o.cageId) },
              })
            }
          >
            逐笼登记 <ChevronRight size={14} />
          </button>
        </div>
      )}
      {filter === "unplanned" ? (
        <div className="unplanned-list">
          {state.cages
            .filter((c) => !c.archived && !c.plan)
            .map((c) => (
              <button
                key={c.id}
                className="care-item"
                onClick={() =>
                  open({ kind: "plan", data: { cageIds: [c.id] } })
                }
              >
                <strong>
                  {c.code} · {c.nickname}
                </strong>
                <Badge tone="gold">未设计划</Badge>
                <ChevronRight size={16} />
              </button>
            ))}
        </div>
      ) : (
        <div
          className={`calendar-layout ${view === "list" ? "list-view" : ""}`}
        >
          {view === "month" ? (
            <div className="month-grid">
              <div className="week-labels">
                {["一", "二", "三", "四", "五", "六", "日"].map((d) => (
                  <span key={d}>{d}</span>
                ))}
              </div>
              <div className="days-grid">
                {Array.from({ length: 42 }, (_, n) => addDays(start, n)).map(
                  (d) => {
                    const rows = items.filter((i) => i.date === d);
                    return (
                      <div
                        key={d}
                        className={`calendar-day ${d.slice(0, 7) !== month.slice(0, 7) ? "other-month" : ""} ${d === selectedDay ? "selected" : ""} ${d === state.today ? "today" : ""}`}
                      >
                        <button
                          className="day-number"
                          aria-label={`${d}${d === state.today ? " 今天" : ""}`}
                          onClick={() => {
                            setSelectedDay(d);
                            setSelected([]);
                          }}
                        >
                          {Number(d.slice(8))}
                          {d === state.today && <span>今天</span>}
                        </button>
                        {rows.slice(0, 3).map((item) => (
                          <button
                            key={item.id}
                            className={`calendar-chip ${item.kind} ${item.original && item.original < state.today && item.kind === "pending" ? "late" : ""}`}
                            aria-label={`${item.title} · ${item.kind === "completed" ? "已换" : item.kind === "predicted" ? "预测" : "待换"}`}
                            title={item.title}
                            onClick={() => {
                              setSelectedDay(d);
                              openItem(item);
                            }}
                          >
                            {item.kind === "completed" ? (
                              <Check size={10} />
                            ) : (
                              <span />
                            )}
                            <strong className="calendar-chip-title">
                              {item.title}
                            </strong>
                            <small>
                              {item.kind === "completed"
                                ? "已换"
                                : item.kind === "predicted"
                                  ? "预测"
                                  : "待换"}
                            </small>
                          </button>
                        ))}
                        {rows.length > 3 && (
                          <button
                            className="more-day"
                            onClick={() => setSelectedDay(d)}
                          >
                            +{rows.length - 3} 项
                          </button>
                        )}
                      </div>
                    );
                  },
                )}
              </div>
            </div>
          ) : (
            <div className="schedule-list">
              {items.filter((i) => i.date.slice(0, 7) === month.slice(0, 7))
                .length === 0 ? (
                <Empty title="这个月还没有换笼日程" />
              ) : (
                [
                  ...new Set(
                    items
                      .filter((i) => i.date.slice(0, 7) === month.slice(0, 7))
                      .map((i) => i.date),
                  ),
                ].map((d) => (
                  <section key={d}>
                    <button
                      className={`schedule-date ${d === selectedDay ? "selected" : ""}`}
                      onClick={() => setSelectedDay(d)}
                    >
                      <strong>{shortDate(d)}</strong>
                      <span>
                        {d === state.today
                          ? "今天"
                          : new Date(d + "T12:00:00").toLocaleDateString(
                              "zh-CN",
                              { weekday: "long" },
                            )}
                      </span>
                    </button>
                    {items
                      .filter((i) => i.date === d)
                      .map((item) => (
                        <button
                          key={item.id}
                          className="schedule-item"
                          onClick={() => {
                            setSelectedDay(d);
                            openItem(item);
                          }}
                        >
                          <span
                            className={`status-dot ${item.kind === "completed" ? "sage" : item.kind === "predicted" ? "muted" : "pink"}`}
                          />
                          <strong>{item.title}</strong>
                          <span>
                            {
                              state.cages.find((c) => c.id === item.cageId)
                                ?.nickname
                            }
                          </span>
                          <Badge
                            tone={
                              item.kind === "completed"
                                ? "sage"
                                : item.kind === "predicted"
                                  ? "muted"
                                  : "pink"
                            }
                          >
                            {item.kind === "completed"
                              ? "实际已完成"
                              : item.kind === "predicted"
                                ? "预测"
                                : "待换笼"}
                          </Badge>
                          <ChevronRight size={15} />
                        </button>
                      ))}
                  </section>
                ))
              )}
            </div>
          )}
          <aside className="day-agenda">
            <div className="agenda-date">
              <span>{Number(selectedDay.slice(5, 7))}月</span>
              <strong>{Number(selectedDay.slice(8))}</strong>
              <span>
                {new Date(selectedDay + "T12:00:00").toLocaleDateString(
                  "zh-CN",
                  { weekday: "long" },
                )}
              </span>
            </div>
            <div className="agenda-heading">
              <h3>当天照护</h3>
              <span>
                {dayItems.filter((i) => i.kind !== "predicted").length +
                  dayTasks.length}{" "}
                项
              </span>
            </div>
            {dayItems.map((item) => (
              <div key={item.id} className={`agenda-item ${item.kind}`}>
                {item.kind === "pending" ? (
                  <input
                    type="checkbox"
                    aria-label={`选择 ${item.title} 换笼`}
                    checked={selected.includes(item.id)}
                    onChange={(e) =>
                      setSelected((v) =>
                        e.target.checked
                          ? [...v, item.id]
                          : v.filter((x) => x !== item.id),
                      )
                    }
                  />
                ) : (
                  <span>
                    {item.kind === "completed" ? (
                      <Check size={17} />
                    ) : (
                      <Clock3 size={16} />
                    )}
                  </span>
                )}
                <button onClick={() => openItem(item)}>
                  <strong>{item.title}</strong>
                  <span>
                    {item.kind === "completed"
                      ? "实际已完成"
                      : item.kind === "predicted"
                        ? "预测 · 尚未生成任务"
                        : "待换笼"}
                  </span>
                  {item.original && item.original !== item.date && (
                    <small>原应换日 {shortDate(item.original)}</small>
                  )}
                </button>
              </div>
            ))}
            {dayTasks.map((t) => (
              <button
                className="agenda-item"
                key={t.id}
                onClick={() =>
                  open({
                    kind: "careForm",
                    data: {
                      taskId: t.id,
                      cageIds: [t.cageId],
                      kind: t.kind,
                      mouseId: t.mouseId,
                    },
                  })
                }
              >
                <span
                  className={`status-dot ${t.status === "completed" ? "sage" : "pink"}`}
                />
                <strong>
                  {state.cages.find((c) => c.id === t.cageId)?.code}
                </strong>
                <span>
                  {{
                    water: "换水",
                    food: "喂食",
                    weight: "称重",
                    observation: "健康观察",
                    nesting: "窝材",
                  }[t.kind] || t.kind}
                </span>
                {t.status === "completed" && <Check size={14} />}
              </button>
            ))}
            {!dayItems.length && !dayTasks.length && (
              <div className="agenda-empty">
                <LeafIcon />
                <p>这一天，安排得刚刚好。</p>
                <button
                  className="text-button"
                  onClick={() =>
                    open({
                      kind: "careForm",
                      data: { date: selectedDay, planned: true },
                    })
                  }
                >
                  安排照护
                </button>
              </div>
            )}
            {selectedRows.length > 0 && (
              <button
                className="button primary full"
                onClick={() =>
                  open({
                    kind: "clean",
                    data: { cageIds: selectedRows.map((i) => i.cageId) },
                  })
                }
              >
                记录已选 {selectedRows.length} 笼的实际完成
              </button>
            )}
            {careEvents.length > 0 && (
              <div className="day-records">
                <h4>当天已记录</h4>
                {careEvents.map((e) => (
                  <p key={e.id}>
                    <Check size={12} />
                    {e.title}
                  </p>
                ))}
              </div>
            )}
          </aside>
        </div>
      )}
      <div className="calendar-legend">
        <span>
          <i className="pink" />
          待执行
        </span>
        <span>
          <i className="gold" />
          原应换日已过
        </span>
        <span>
          <i className="sage" />
          实际已完成
        </span>
        <span>
          <i className="predicted" />
          预测
        </span>
        <small>预测只用于安排，不生成通知。</small>
      </div>
    </section>
  );
}
function LeafIcon() {
  return (
    <img
      className="agenda-mouse"
      src={`/assets/mice/cream-sleep.webp?v=${SPRITE_VERSION}`}
      alt="休息中的鼠鼠"
    />
  );
}
