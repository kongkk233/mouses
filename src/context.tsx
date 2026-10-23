import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { AppState } from "../shared/types";
import { api, ApiError } from "./api";
import { SPRITE_VERSION } from "../shared/generated-assets";
export interface Panel {
  kind: string;
  id?: string;
  data?: Record<string, any>;
}
interface Context {
  state: AppState;
  open: (panel: Panel) => void;
  back: () => void;
  close: () => void;
  stack: Panel[];
  command: (
    type: string,
    payload: Record<string, any>,
    revision?: number,
    opId?: string,
  ) => Promise<Record<string, any>>;
  reload: () => Promise<AppState>;
  toast: (message: string) => void;
}
export const AppContext = createContext<Context>(null!);
export const useApp = () => useContext(AppContext);
export function useMutation() {
  const ctx = useApp(),
    revision = useRef(ctx.state.revision),
    pending = useRef<{ key: string; id: string } | null>(null);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState<ApiError | null>(null);
  const submit = async (
    type: string,
    payload: Record<string, any>,
    onSuccess?: () => void,
  ) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const key = JSON.stringify({ type, payload });
    if (pending.current?.key !== key)
      pending.current = { key, id: crypto.randomUUID() };
    try {
      const result = await ctx.command(
        type,
        payload,
        revision.current,
        pending.current.id,
      );
      pending.current = null;
      revision.current = result.__revision;
      onSuccess?.();
      return result;
    } catch (e) {
      setError(e as ApiError);
    } finally {
      setBusy(false);
    }
  };
  const resolveConflict = async () => {
    const latest = await ctx.reload();
    revision.current = latest.revision;
    setError(null);
  };
  // Reload is asynchronous; capture the resulting revision on the following render.
  if (revision.current === -1) revision.current = ctx.state.revision;
  return { busy, error, submit, resolveConflict };
}
export function Provider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState | null>(null),
    [loadError, setLoadError] = useState(""),
    [stack, setStack] = useState<Panel[]>([]),
    [message, setMessage] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null),
    stateRef = useRef(state);
  stateRef.current = state;
  const reload = async () => {
    try {
      const s = await api<AppState>("/state");
      setState(s);
      setLoadError("");
      return s;
    } catch (e) {
      setLoadError((e as Error).message);
      throw e;
    }
  };
  useEffect(() => {
    void reload().catch(() => {});
    const interval = setInterval(() => {
      if (!document.hidden) void reload().catch(() => {});
    }, 60000);
    const focus = () => void reload().catch(() => {});
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", focus);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);
  const toast = (value: string) => {
    setMessage(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setMessage(""), 3500);
  };
  const command = async (
    type: string,
    payload: Record<string, any>,
    revision?: number,
    opId?: string,
  ) => {
    const result = await api<{ state: AppState; result: Record<string, any> }>(
      "/commands",
      {
        type,
        payload,
        expectedRevision: revision ?? stateRef.current!.revision,
        opId: opId || crypto.randomUUID(),
      },
    );
    setState(result.state);
    return { ...result.result, __revision: result.state.revision };
  };
  const open = (panel: Panel) => setStack((v) => [...v, panel]),
    back = () => setStack((v) => v.slice(0, -1)),
    close = () => setStack([]);
  if (!state)
    return (
      <div className="boot">
        <img
          src={`/assets/mice/cream-sleep.webp?v=${SPRITE_VERSION}`}
          alt="熟睡的鼠鼠"
        />
        <h1>小窝正在醒来…</h1>
        {loadError ? (
          <>
            <p role="alert">{loadError}</p>
            {loadError.includes("访问已过期") && (
              <a href="/" target="_blank" rel="noopener noreferrer">
                重新登录
              </a>
            )}
            <button onClick={() => void reload().catch(() => {})}>
              重新连接
            </button>
          </>
        ) : (
          <span className="loading-dots">···</span>
        )}
      </div>
    );
  return (
    <AppContext.Provider
      value={{ state, open, back, close, stack, command, reload, toast }}
    >
      {loadError && (
        <div className="connection-banner" role="status">
          {loadError} · 当前为上次读取的数据{" "}
          {loadError.includes("访问已过期") && (
            <a href="/" target="_blank" rel="noopener noreferrer">
              重新登录
            </a>
          )}
          <button onClick={() => void reload().catch(() => {})}>重试</button>
        </div>
      )}
      {children}
      <div className={`toast ${message ? "show" : ""}`} role="status">
        {message}
      </div>
    </AppContext.Provider>
  );
}
