import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  FlaskConical,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { api } from "./api";

interface EnvironmentInfo {
  environment: "production" | "staging" | "development";
  origin: string;
  version: string;
  deployedAt: string | null;
  pushEnabled: boolean;
}
interface Session extends EnvironmentInfo {
  role: "admin" | "member";
  adminConfigured: boolean;
  productionOrigin: string;
  stagingOrigin: string;
}
const EnvironmentContext = createContext<Session>(null!);
export const useEnvironment = () => useContext(EnvironmentContext);
const labels = {
  production: "生产环境",
  staging: "测试环境",
  development: "本地开发",
};

export function EnvironmentProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    void api<Session>("/session")
      .then((value) => {
        document.documentElement.dataset.environment = value.environment;
        if (value.environment === "staging")
          document.title = "测试环境 · 鼠鼠小窝";
        setSession(value);
      })
      .catch((e) => setError(e.message));
  }, []);
  if (!session)
    return (
      <div className="boot">
        <h1>{error || "正在连接小窝…"}</h1>
        {error && <a href="/admin">重新登录</a>}
      </div>
    );
  return (
    <EnvironmentContext.Provider value={session}>
      {children}
    </EnvironmentContext.Provider>
  );
}
export function EnvironmentBar() {
  const session = useEnvironment();
  if (session.environment !== "staging") return null;
  return (
    <aside className="environment-bar" aria-label="当前为测试环境">
      <span>
        <FlaskConical size={17} />
        <strong>测试环境</strong>
      </span>
      <span className="environment-version">{session.version.slice(0, 8)}</span>
      <a
        href={
          session.productionOrigin
            ? `${session.productionOrigin}/admin`
            : "/admin"
        }
      >
        管理控制台 <ArrowUpRight size={14} />
      </a>
    </aside>
  );
}
export function AdminEntry() {
  const session = useEnvironment();
  return session.role === "admin" ? (
    <a href="/admin" className="icon-button" aria-label="管理控制台">
      <ShieldCheck size={20} />
    </a>
  ) : (
    <span className="profile-dot" title="小窝访问">
      窝
    </span>
  );
}
export function AdminConsole() {
  const session = useEnvironment();
  const [environments, setEnvironments] = useState<
    (EnvironmentInfo & { healthy: boolean })[]
  >([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const refresh = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ environments: typeof environments }>(
        "/admin/environments",
      );
      setEnvironments(result.environments);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void refresh();
  }, []);
  return (
    <>
      <EnvironmentBar />
      <main className="admin-workspace">
        <header className="admin-heading">
          <a className="back-link" href="/">
            <ArrowLeft size={17} />
            回到小窝
          </a>
          <form method="post" action="/session/logout">
            <button className="text-button" type="submit">
              退出管理员
            </button>
          </form>
        </header>
        <div className="admin-title">
          <div>
            <span className="eyebrow">
              <ShieldCheck size={16} /> ADMIN
            </span>
            <h1>小窝控制台</h1>
          </div>
          <button
            className="button"
            disabled={busy}
            onClick={() => void refresh()}
          >
            <RefreshCw size={16} />
            {busy ? "正在刷新…" : "刷新状态"}
          </button>
        </div>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="environment-grid">
          {environments.map((environment) => {
            const testing = environment.environment === "staging";
            const current = environment.origin === session.origin;
            const target = current
              ? "/"
              : `${environment.origin}${testing ? "/session/connect" : "/"}`;
            return (
              <article
                className={`environment-card ${testing ? "testing" : ""}`}
                key={environment.environment}
              >
                <div className="row between">
                  <span className="environment-icon">
                    {testing ? (
                      <FlaskConical size={25} />
                    ) : (
                      <ShieldCheck size={25} />
                    )}
                  </span>
                  <span
                    className={`badge ${environment.healthy ? "sage" : "gold"}`}
                  >
                    {environment.healthy ? "运行中" : "暂未连接"}
                  </span>
                </div>
                <h2>{labels[environment.environment]}</h2>
                <p className="environment-host">
                  {new URL(environment.origin).host}
                </p>
                <dl>
                  <div>
                    <dt>版本</dt>
                    <dd>
                      <code>
                        {environment.version === "unknown"
                          ? "—"
                          : environment.version.slice(0, 8)}
                      </code>
                    </dd>
                  </div>
                  <div>
                    <dt>部署时间</dt>
                    <dd>
                      {environment.deployedAt
                        ? new Date(environment.deployedAt).toLocaleString(
                            "zh-CN",
                            { timeZone: "Asia/Shanghai", hour12: false },
                          )
                        : "本地运行"}
                    </dd>
                  </div>
                  <div>
                    <dt>手机推送</dt>
                    <dd>
                      {environment.pushEnabled ? "按照护设置运行" : "已关闭"}
                    </dd>
                  </div>
                </dl>
                {environment.healthy ? (
                  <a
                    className="button primary"
                    href={target}
                    target={current ? undefined : "_blank"}
                    rel="noopener noreferrer"
                  >
                    进入{testing ? "测试环境" : "小窝"}{" "}
                    <ArrowUpRight size={16} />
                  </a>
                ) : (
                  <span className="field-note">服务恢复后可重新进入</span>
                )}
              </article>
            );
          })}
        </div>
        <p className="admin-footnote">
          测试与生产使用独立资料库。更新代码会保留各自数据，测试资料不会自动写入生产。
        </p>
      </main>
    </>
  );
}
