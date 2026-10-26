import {
  useEffect,
  useRef,
  useState,
  cloneElement,
  isValidElement,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  X,
  AlertCircle,
  LoaderCircle,
  ExternalLink,
} from "lucide-react";
import { useApp, useMutation } from "../context";
import type { Event, Mouse } from "../../shared/types";
import { ageText, shortDate } from "../../shared/dates";
import { sexLabel } from "../../shared/types";
import { MouseSprite } from "./MouseSprite";
import { mouseTags } from "../selectors";
import { safePhotoLink } from "../../shared/photos";
import { textLimit } from "../../shared/validation";
import { useEnvironment } from "../environment";
export const Badge = ({
  children,
  tone = "muted",
}: {
  children: ReactNode;
  tone?: string;
}) => <span className={`badge ${tone}`}>{children}</span>;
let openDrawers = 0;
let initialOverflow = "";
export function Drawer({
  title,
  children,
  wide = false,
}: {
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  const { back, close, stack } = useApp(),
    ref = useRef<HTMLDialogElement>(null),
    shellRef = useRef<HTMLDivElement>(null),
    backRef = useRef(back);
  const environment = useEnvironment();
  backRef.current = back;
  useEffect(() => {
    const dialog = ref.current!;
    dialog.showModal();
    if (openDrawers === 0) initialOverflow = document.body.style.overflow;
    openDrawers++;
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      openDrawers--;
      if (openDrawers === 0) document.body.style.overflow = initialOverflow;
    };
  }, []);
  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    let startX = 0,
      startY = 0,
      dragging = false;
    const onStart = (e: TouchEvent) => {
      startX = e.touches[0].clientX;
      startY = e.touches[0].clientY;
      dragging = false;
      shell.style.transition = "none";
    };
    const onMove = (e: TouchEvent) => {
      const dx = e.touches[0].clientX - startX;
      const dy = e.touches[0].clientY - startY;
      if (!dragging) {
        if (Math.abs(dx) > Math.abs(dy) + 4 && dx > 0) dragging = true;
        else if (Math.abs(dy) > 8) return;
      }
      if (!dragging) return;
      e.preventDefault();
      const offset = Math.max(0, dx);
      shell.style.transform = `translateX(${offset}px)`;
      shell.style.opacity = String(Math.max(0.55, 1 - offset / 350));
    };
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - startX;
      shell.style.transition = "";
      shell.style.transform = "";
      shell.style.opacity = "";
      if (dragging && dx > 90) backRef.current();
      dragging = false;
    };
    shell.addEventListener("touchstart", onStart, { passive: true });
    shell.addEventListener("touchmove", onMove, { passive: false });
    shell.addEventListener("touchend", onEnd, { passive: true });
    return () => {
      shell.removeEventListener("touchstart", onStart);
      shell.removeEventListener("touchmove", onMove);
      shell.removeEventListener("touchend", onEnd);
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className={`drawer ${wide ? "wide" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        back();
      }}
      onClick={(e) => {
        if (e.target === ref.current) back();
      }}
    >
      <div ref={shellRef} className="drawer-shell">
        <header className="drawer-header">
          <div className="row gap-12">
            {stack.length > 1 && (
              <button
                className="icon-button"
                aria-label="返回上一页"
                onClick={back}
              >
                <ArrowLeft size={20} />
              </button>
            )}
            <h2>
              {environment.environment === "staging" ? "测试 · " : ""}
              {title}
            </h2>
          </div>
          <button className="icon-button" aria-label="关闭面板" onClick={close}>
            <X size={21} />
          </button>
        </header>
        <div className="drawer-content">{children}</div>
      </div>
    </dialog>
  );
}
export function FormShell({
  title,
  children,
  type,
  payload,
  after,
  submitLabel = "保存记录",
  disabled = false,
  mutation: provided,
}: {
  title: string;
  children: ReactNode;
  type: string;
  payload: () => Record<string, any>;
  after?: (result?: any) => void;
  submitLabel?: string;
  disabled?: boolean;
  mutation?: ReturnType<typeof useMutation>;
}) {
  const own = useMutation(),
    mutation = provided || own;
  const { back, toast } = useApp();
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (mutation.error?.field)
      form.current
        ?.querySelector<HTMLInputElement>(
          `[name="${CSS.escape(mutation.error.field)}"]`,
        )
        ?.focus();
  }, [mutation.error]);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const result = await mutation.submit(type, payload());
    if (result) {
      toast("已保存到小窝");
      if (after) after(result);
      else back();
    }
  };
  return (
    <form
      ref={form}
      className="record-form"
      onSubmit={submit}
      onInvalidCapture={(e) => {
        const input = e.target as HTMLInputElement;
        input.setCustomValidity("");
        const v = input.validity;
        const message = v.valueMissing
          ? "请填写此项或完成勾选"
          : v.rangeUnderflow
            ? input.name === "birthTotal"
              ? "历史出生总数不能少于当前活体幼鼠数"
              : `请填写不小于 ${input.min} 的值`
            : v.rangeOverflow
              ? `请填写不大于 ${input.max} 的值`
              : v.stepMismatch
                ? "请填写符合精度要求的数值"
                : v.tooLong
                  ? `最多可填写 ${input.maxLength} 个字符`
                  : v.typeMismatch
                    ? "请填写有效的格式"
                    : "请检查此项内容";
        input.setCustomValidity(message);
      }}
      onInputCapture={(e) => {
        const input = e.target as HTMLInputElement;
        if (typeof input.setCustomValidity === "function")
          input.setCustomValidity("");
      }}
      aria-label={title}
    >
      {children}
      {mutation.error && (
        <div className="form-error" role="alert">
          <AlertCircle size={18} />
          <div>
            {mutation.error.message}
            {mutation.error.status === 401 && (
              <a
                className="text-button"
                href="/"
                target="_blank"
                rel="noopener noreferrer"
              >
                在新标签页登录，保留当前输入
              </a>
            )}
            {mutation.error.status === 409 && (
              <button
                type="button"
                className="text-button"
                onClick={() => void mutation.resolveConflict()}
              >
                载入最新资料，保留当前输入
              </button>
            )}
          </div>
        </div>
      )}
      <footer className="form-footer">
        <button type="button" className="button" onClick={back}>
          取消
        </button>
        <button
          type="submit"
          className="button primary"
          disabled={mutation.busy || disabled}
        >
          {mutation.busy ? <LoaderCircle className="spin" size={17} /> : null}
          {mutation.busy ? "正在保存…" : submitLabel}
        </button>
      </footer>
    </form>
  );
}
export function Field({
  label,
  children,
  wide = false,
  hint,
}: {
  label: string;
  children: ReactNode;
  wide?: boolean;
  hint?: string;
}) {
  const child = isValidElement<{
    name?: string;
    type?: string;
    maxLength?: number;
    value?: unknown;
  }>(children)
    ? children
    : null;
  const isText =
    child &&
    (child.type === "textarea" ||
      (child.type === "input" &&
        [undefined, "text", "url", "email", "search"].includes(
          child.props.type,
        )));
  const limit = isText
    ? (child.props.maxLength ?? textLimit(child.props.name || ""))
    : undefined;
  const count =
    typeof child?.props.value === "string" ? child.props.value.length : 0;
  return (
    <label className={`field ${wide ? "span-2" : ""}`}>
      <span className="field-heading">
        <span>{label}</span>
        {limit !== undefined && (
          <small className="field-count">
            {count}/{limit}
          </small>
        )}
      </span>
      {limit !== undefined && child
        ? cloneElement(child, { maxLength: limit })
        : children}
      {hint && <small>{hint}</small>}
    </label>
  );
}
export function MouseRow({
  mouse,
  highlight = false,
  compact = false,
}: {
  mouse: Mouse;
  highlight?: boolean;
  compact?: boolean;
}) {
  const { state, open } = useApp();
  return (
    <button
      className={`member-row ${highlight ? "highlight" : ""} ${compact ? "compact" : ""}`}
      onClick={() => open({ kind: "mouse", id: mouse.id })}
    >
      <span className="avatar-mini">
        <MouseSprite mouse={mouse} />
      </span>
      <span className="member-identity">
        <strong>{mouse.code}</strong>
        {!compact && (
          <span>{mouse.nickname || mouse.genotype || "待鉴定"}</span>
        )}
      </span>
      {!compact && (
        <>
          <span className={`sex-mark ${mouse.sex}`}>
            {mouse.sex === "male" ? "♂" : mouse.sex === "female" ? "♀" : "?"}
          </span>
          <span className="member-age">
            {ageText(mouse.dob, state.today, mouse.dobEstimated)}
          </span>
        </>
      )}
      <span className="member-badges">
        {mouseTags(state, mouse)
          .slice(0, compact ? 1 : 2)
          .map((tag, i) => (
            <Badge key={i} tone={tag.tone}>
              {tag.label}
            </Badge>
          ))}
      </span>
    </button>
  );
}
export function History({
  events,
  limit = 20,
}: {
  events: Event[];
  limit?: number;
}) {
  const [shown, setShown] = useState(limit);
  const { state } = useApp();
  return events.length ? (
    <div className="history-list">
      {events.slice(0, shown).map((e) => {
        const taskNotes =
          typeof e.details.taskNotes === "string" && e.details.taskNotes
            ? e.details.taskNotes
            : state.careTasks.find((t) => t.eventId === e.id)?.notes;
        return (
          <article key={e.id} className={e.voided ? "voided" : ""}>
            <span className="history-dot" />
            <div>
              <time>
                {e.date}{" "}
                <span>
                  {new Date(e.createdAt).toLocaleTimeString("zh-CN", {
                    hour: "2-digit",
                    minute: "2-digit",
                    timeZone: state.settings.timezone,
                  })}
                </span>
              </time>
              <strong>
                {e.title}
                {e.voided ? " · 已撤销" : ""}
              </strong>
              {e.notes && <p>{e.notes}</p>}
              {typeof e.details.exceptionReason === "string" &&
                e.details.exceptionReason && (
                  <p>特殊处理原因：{e.details.exceptionReason}</p>
                )}
              {taskNotes && taskNotes !== e.notes && (
                <p>待办备注：{taskNotes}</p>
              )}
              {e.type === "care.record" && (
                <div className="history-evidence">
                  {typeof e.details.observer === "string" &&
                    e.details.observer && <span>{e.details.observer}</span>}
                  {e.details.kind === "phenotype" && (
                    <span>
                      {e.details.experimentalFact === false
                        ? "日常观察"
                        : "实验事实"}
                    </span>
                  )}
                  {safePhotoLink(e.details.photoUrl) && (
                    <a
                      href={safePhotoLink(e.details.photoUrl)!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-button"
                    >
                      <ExternalLink size={13} />
                      查看照片
                    </a>
                  )}
                </div>
              )}
            </div>
          </article>
        );
      })}
      {events.length > shown && (
        <button
          type="button"
          className="text-button"
          onClick={() => setShown((n) => n + limit)}
        >
          继续查看记录（还有 {events.length - shown} 条）
        </button>
      )}
    </div>
  ) : (
    <Empty title="还没有记录" text="每一次真实的照护，都可以从这里留下。" />
  );
}
export function Empty({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <MouseSprite pose="sleep" />
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}
export function MouseSelect({
  value,
  onChange,
  sex,
  exclude,
  allowArchived = false,
  name,
  bornBefore,
}: {
  value: string;
  onChange: (v: string) => void;
  sex?: "male" | "female";
  exclude?: string;
  allowArchived?: boolean;
  name?: string;
  bornBefore?: string;
}) {
  const { state } = useApp();
  return (
    <select
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">未登记 / 未知</option>
      {state.mice
        .filter(
          (m) =>
            m.id !== exclude &&
            (!sex || m.sex === sex) &&
            (!bornBefore ||
              (m.dob < bornBefore && m.weaningStatus !== "unweaned") ||
              m.id === value) &&
            (allowArchived || m.status === "active"),
        )
        .map((m) => (
          <option key={m.id} value={m.id}>
            {m.code} · {m.nickname || sexLabel[m.sex]}
            {m.status !== "active" ? " · 已归档" : ""}
          </option>
        ))}
    </select>
  );
}
export function CageSelect({
  value,
  onChange,
  emptyLabel = "选择笼位",
  name = "cageId",
}: {
  value: string;
  onChange: (v: string) => void;
  emptyLabel?: string;
  name?: string;
}) {
  const { state } = useApp();
  return (
    <select
      name={name}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      required
    >
      <option value="">{emptyLabel}</option>
      {state.cages
        .filter((c) => !c.archived)
        .map((c) => (
          <option key={c.id} value={c.id}>
            {c.code} · {c.nickname}
          </option>
        ))}
    </select>
  );
}
export function CapacityPreview({
  cageId,
  adding,
  moving = [],
  reason,
  onReason,
}: {
  cageId: string;
  adding: number;
  moving?: string[];
  reason: string;
  onReason: (v: string) => void;
}) {
  const { state } = useApp(),
    cage = state.cages.find((c) => c.id === cageId);
  if (!cage) return null;
  const count =
    state.mice.filter(
      (m) =>
        m.cageId === cageId && m.status === "active" && !moving.includes(m.id),
    ).length + adding;
  const overflow = count > cage.capacity;
  return (
    <div className={`capacity-preview ${overflow ? "overflow" : ""}`}>
      <div className="row between">
        <span>{cage.code} 保存后</span>
        <strong>
          {count} / {cage.capacity} 只
          {overflow ? ` · 超出 ${count - cage.capacity} 只` : ""}
        </strong>
      </div>
      {overflow && (
        <Field label="超容量原因">
          <input
            name="capacityReason"
            value={reason}
            onChange={(e) => onReason(e.target.value)}
            required
            placeholder="如实说明当前情况"
          />
        </Field>
      )}
    </div>
  );
}
