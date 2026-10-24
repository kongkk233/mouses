import { useEffect, useState } from "react";
import {
  Bell,
  Check,
  Dices,
  Info,
  LockKeyhole,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import { useApp } from "../context";
import { api } from "../api";
import { Badge, Field, FormShell } from "./Primitives";
import { MouseSprite } from "./MouseSprite";
import { appearanceFor, coatLabels, coats } from "../../shared/appearance";
import type { Appearance } from "../../shared/types";
export function AppearanceForm({ id }: { id: string }) {
  const { state } = useApp(),
    m = state.mice.find((m) => m.id === id)!;
  const [candidate, setCandidate] = useState<Appearance>(m.appearance),
    [locked, setLocked] = useState(m.appearanceLocked),
    [reset, setReset] = useState(false);
  const setTrait = (key: string, value: string) => {
    setCandidate((a) => ({
      ...a,
      [key]: value,
      provenance: { ...a.provenance, [key]: "人工记录" },
    }));
    setReset(false);
  };
  const traits: Record<string, [string, string[]]> = {
    pattern: ["花纹", ["solid", "cap", "socks", "blaze"]],
    ears: ["耳朵", ["round", "large"]],
    eyes: ["眼睛", ["black", "brown", "ruby"]],
    face: ["脸型", ["round", "pointed"]],
    body: ["体型", ["round", "slender"]],
    tail: ["尾巴", ["curl", "long"]],
    expression: ["表情", ["curious", "sleepy", "gentle"]],
  };
  const labels: Record<string, string> = {
    solid: "纯色",
    cap: "头顶斑",
    socks: "白爪",
    blaze: "额间白斑",
    round: "圆润",
    large: "大圆耳",
    black: "黑色",
    brown: "深棕",
    ruby: "红色",
    pointed: "尖脸",
    slender: "纤细",
    curl: "微弯",
    long: "长尾",
    curious: "好奇",
    sleepy: "困倦",
    gentle: "温柔",
  };
  return (
    <FormShell
      title="小窝形象候选"
      type="mouse.appearance"
      payload={() => ({ id, appearance: candidate, locked, reset })}
      submitLabel="确认并保存这套外观"
    >
      <div className="appearance-preview">
        <MouseSprite appearance={candidate} />
        <div>
          <strong>
            {m.code} · {m.nickname}
          </strong>
          <span>{coatLabels[candidate.coat]}</span>
          <Badge tone="lilac">候选预览</Badge>
        </div>
      </div>
      <div className="action-row">
        <button
          type="button"
          className="button"
          onClick={() => {
            setCandidate(appearanceFor(Math.floor(Math.random() * 2 ** 30)));
            setReset(false);
          }}
        >
          <Dices size={16} />
          换一套候选
        </button>
        <button
          type="button"
          className="text-button"
          onClick={() => {
            setCandidate(appearanceFor(m.avatarSeed));
            setReset(true);
          }}
        >
          恢复默认
        </button>
      </div>
      <div className="form-grid">
        <Field label="体色">
          <select
            value={candidate.coat}
            onChange={(e) => setTrait("coat", e.target.value)}
          >
            {coats.map((c) => (
              <option key={c} value={c}>
                {coatLabels[c]}
              </option>
            ))}
          </select>
        </Field>
        {Object.entries(traits).map(([key, [label, values]]) => (
          <Field key={key} label={label}>
            <select
              value={(candidate as any)[key]}
              onChange={(e) => setTrait(key, e.target.value)}
            >
              {values.map((v) => (
                <option key={v} value={v}>
                  {labels[v]}
                </option>
              ))}
            </select>
          </Field>
        ))}
      </div>
      <label className="checkbox-label">
        <input
          type="checkbox"
          checked={locked}
          onChange={(e) => setLocked(e.target.checked)}
        />
        <LockKeyhole size={14} />
        锁定这套外观
      </label>
      <p className="field-note">
        仅更新这只鼠的装饰形象，真实表型、亲缘和历史子代外观不会随之改变。
      </p>
    </FormShell>
  );
}
interface PushStatus {
  enabled: boolean;
  publicKey: string;
  subscriptions: number;
  recent: {
    id: string;
    status: string;
    attempts: number;
    createdAt: string;
    acceptedAt?: string;
    error?: string;
  }[];
}
function base64Bytes(value: string): Uint8Array<ArrayBuffer> {
  const raw = atob(value.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
async function pushWorkerReady(): Promise<ServiceWorkerRegistration> {
  let timer: ReturnType<typeof setTimeout>;
  const work = (async () => {
    await navigator.serviceWorker.register("/sw.js");
    return navigator.serviceWorker.ready;
  })();
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(
          new Error("通知组件暂时未能启动，请检查网络并重新打开小窝后重试"),
        ),
      10000,
    );
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}
export function SettingsPanel() {
  const { state, toast } = useApp(),
    [form, setForm] = useState({ ...state.settings }),
    [push, setPush] = useState<PushStatus | null>(null),
    [pushError, setPushError] = useState(""),
    [pushBusy, setPushBusy] = useState(false),
    [subscribed, setSubscribed] = useState(false);
  const set = (key: string, value: unknown) =>
    setForm((f) => ({ ...f, [key]: value }));
  const refresh = async () => {
    setPush(await api<PushStatus>("/notifications"));
    if ("serviceWorker" in navigator) {
      const reg = await navigator.serviceWorker.getRegistration();
      setSubscribed(!!(await reg?.pushManager?.getSubscription()));
    }
  };
  useEffect(() => {
    void refresh().catch((e) => setPushError(e.message));
  }, []);
  const enable = async () => {
    setPushBusy(true);
    setPushError("");
    try {
      if (
        !window.isSecureContext ||
        !("Notification" in window) ||
        !("PushManager" in window)
      )
        throw new Error(
          "此环境还不支持推送。iPhone 请通过 HTTPS 访问，将小窝添加到主屏幕后再开启。",
        );
      const permission = await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error(
          "通知权限未开启，可在浏览器或系统设置中调整。站内照护与提醒仍可使用。",
        );
      const config = push || (await api<PushStatus>("/notifications"));
      const reg = await pushWorkerReady();
      const subscription =
        (await reg.pushManager.getSubscription()) ||
        (await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: base64Bytes(config.publicKey),
        }));
      await api("/notifications/subscribe", subscription.toJSON());
      await refresh();
      toast("本设备已连接通知，请发送测试并在手机上确认");
    } catch (e) {
      setPushError((e as Error).message);
    } finally {
      setPushBusy(false);
    }
  };
  const test = async () => {
    setPushBusy(true);
    setPushError("");
    try {
      const reg = await pushWorkerReady(),
        sub = await reg.pushManager.getSubscription();
      if (!sub) throw new Error("请先开启本设备通知");
      await api("/notifications/test", { endpoint: sub.endpoint });
      toast("测试已进入队列，请在手机上确认实际显示");
      await refresh();
    } catch (e) {
      setPushError((e as Error).message);
    } finally {
      setPushBusy(false);
    }
  };
  const disable = async () => {
    setPushBusy(true);
    try {
      const reg = await pushWorkerReady(),
        sub = await reg.pushManager.getSubscription();
      if (sub) {
        await api("/notifications/unsubscribe", { endpoint: sub.endpoint });
        await sub.unsubscribe();
      }
      await refresh();
      toast("本设备已停止推送");
    } catch (e) {
      setPushError((e as Error).message);
    } finally {
      setPushBusy(false);
    }
  };
  return (
    <>
      <section className="settings-notification">
        <div className="section-title">
          <h3>
            <Smartphone size={19} />
            手机通知
          </h3>
          <Badge tone={subscribed ? "sage" : "muted"}>
            {subscribed ? "本设备已订阅" : "本设备未连接"}
          </Badge>
        </div>
        <p>iPhone：用 HTTPS 打开小窝 → 添加到主屏幕 → 开启通知 → 发送测试。</p>
        <div className="action-row">
          <button
            className="button primary"
            type="button"
            disabled={pushBusy || !push?.enabled}
            onClick={() => void enable()}
          >
            <Bell size={16} />
            {subscribed ? "重新连接" : "开启本设备通知"}
          </button>
          <button
            className="button"
            type="button"
            disabled={pushBusy || !subscribed}
            onClick={() => void test()}
          >
            发送测试
          </button>
          {subscribed && (
            <button
              className="text-button"
              type="button"
              onClick={() => void disable()}
            >
              撤销订阅
            </button>
          )}
          <button
            className="icon-button"
            type="button"
            aria-label="刷新通知状态"
            onClick={() => void refresh().catch((e) => setPushError(e.message))}
          >
            <RefreshCw size={16} />
          </button>
        </div>
        {pushError && (
          <div className="form-error" role="alert">
            {pushError}
          </div>
        )}
        {push && !push.enabled && (
          <p className="subtle-notice">
            服务器已暂停外部推送，本地计划与记录正常。
          </p>
        )}
        {push?.recent.length ? (
          <details className="delivery-logs">
            <summary>最近发送记录 · 仅记录服务接受结果</summary>
            {push.recent.map((row) => (
              <div key={row.id}>
                <span>{new Date(row.createdAt).toLocaleString("zh-CN")}</span>
                <Badge
                  tone={
                    row.status === "accepted"
                      ? "sage"
                      : row.status === "failed"
                        ? "gold"
                        : "muted"
                  }
                >
                  {{
                    accepted: "服务已接受",
                    pending: "队列等待",
                    failed: "发送失败",
                    cancelled: "已取消",
                  }[row.status] || row.status}
                </Badge>
                {row.error && <p>{row.error}</p>}
              </div>
            ))}
          </details>
        ) : (
          <p className="field-note">
            暂无发送记录。服务接受与手机实际显示分开验收。
          </p>
        )}
      </section>
      <FormShell
        title="小窝设置"
        type="settings.update"
        payload={() => form}
        submitLabel="保存设置"
      >
        <h3>照护偏好</h3>
        <div className="form-grid">
          <Field label="新笼默认容量">
            <input
              name="defaultCapacity"
              type="number"
              min="1"
              max="500"
              value={form.defaultCapacity}
              onChange={(e) => set("defaultCapacity", Number(e.target.value))}
            />
          </Field>
          <Field label="换笼周期模板 / 天">
            <input
              name="defaultIntervalDays"
              type="number"
              min="1"
              max="365"
              value={form.defaultIntervalDays}
              onChange={(e) =>
                set("defaultIntervalDays", Number(e.target.value))
              }
            />
          </Field>
          <Field label="默认提醒时刻">
            <input
              name="reminderTime"
              type="time"
              value={form.reminderTime}
              onChange={(e) => set("reminderTime", e.target.value)}
            />
          </Field>
          <Field label="实验室时区">
            <select
              name="timezone"
              value={form.timezone}
              onChange={(e) => set("timezone", e.target.value)}
            >
              {[
                "Asia/Shanghai",
                "Asia/Hong_Kong",
                "Asia/Tokyo",
                "UTC",
                "Europe/London",
                "America/New_York",
                "America/Los_Angeles",
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </Field>
          <Field label="静默开始">
            <input
              name="quietStart"
              type="time"
              value={form.quietStart}
              onChange={(e) => set("quietStart", e.target.value)}
            />
          </Field>
          <Field label="静默结束">
            <input
              name="quietEnd"
              type="time"
              value={form.quietEnd}
              onChange={(e) => set("quietEnd", e.target.value)}
            />
          </Field>
        </div>
        {form.timezone !== state.settings.timezone && (
          <div className="preview-box">
            时区将变更为 {form.timezone}。待发送通知按新时区的{" "}
            {form.reminderTime} 安排，实际历史日期保留。
            <p>
              当前时刻预览：
              {new Date().toLocaleString("zh-CN", { timeZone: form.timezone })}
            </p>
          </div>
        )}
        <label className="toggle-setting">
          <span>后台手机推送</span>
          <input
            type="checkbox"
            checked={form.pushEnabled}
            onChange={(e) => set("pushEnabled", e.target.checked)}
          />
        </label>
        <h3 className="spaced-heading">小窝的样子</h3>
        <Field label="动态效果">
          <select
            value={form.motion}
            onChange={(e) => set("motion", e.target.value)}
          >
            <option value="full">完整动效</option>
            <option value="gentle">轻动效</option>
            <option value="static">静态</option>
          </select>
        </Field>
        <Field label="颜色主题">
          <select
            value={
              localStorage.getItem("nook-theme") ??
              "auto"
            }
            onChange={(e) => {
              const v = e.target.value;
              localStorage.setItem("nook-theme", v);
              if (v === "auto")
                document.documentElement.removeAttribute("data-theme");
              else
                document.documentElement.setAttribute("data-theme", v);
            }}
          >
            <option value="auto">跟随系统</option>
            <option value="light">浅色</option>
            <option value="dark">深色</option>
          </select>
        </Field>
        <label className="toggle-setting">
          <span>个体性格标签</span>
          <input
            type="checkbox"
            checked={form.personalities}
            onChange={(e) => set("personalities", e.target.checked)}
          />
        </label>
        <label className="toggle-setting">
          <span>小窝动态文案</span>
          <input
            type="checkbox"
            checked={form.stories}
            onChange={(e) => set("stories", e.target.checked)}
          />
        </label>
        <label className="toggle-setting">
          <span>生日与成长纪念提示</span>
          <input
            type="checkbox"
            checked={form.anniversaries}
            onChange={(e) => set("anniversaries", e.target.checked)}
          />
        </label>
        <div className="subtle-notice">
          <Info size={16} />
          <span>
            鼠鼠的动作是趣味演绎，档案状态以登记为准。系统开启减少动态效果时，场景自动静态显示；道具不表示真实余量。
          </span>
        </div>
        <p className="field-note">
          周期模板仅用于新计划，已启用的笼位周期需在“换笼计划”中明确调整。
        </p>
      </FormShell>
      <form method="post" action="/session/logout" className="danger-zone">
        <button className="text-button" type="submit">
          退出当前设备
        </button>
      </form>
    </>
  );
}
