import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import App from "../src/App";
import { Provider, useApp } from "../src/context";
import "../src/styles.css";

function PerformanceProbe() {
  const { state } = useApp();
  const [readyMs, setReadyMs] = useState(0);
  const [frames, setFrames] = useState<Record<string, unknown> | null>(null);
  const [running, setRunning] = useState(false);
  const [feedback, setFeedback] = useState<
    { action: string; ms: number; cards: number; rows: number }[]
  >([]);
  const raf = useRef(0);
  useEffect(() => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => setReadyMs(Math.round(performance.now()))),
    );
    const record = (event: Event) => {
      const target = event.target as HTMLElement;
      const search =
        event.type === "input" &&
        target.matches('input[aria-label="搜索小鼠或笼位"]');
      const view =
        event.type === "click" && target.closest(".view-tabs button");
      if (!search && !view) return;
      const start = performance.now();
      requestAnimationFrame(() =>
        requestAnimationFrame(() =>
          setFeedback((previous) =>
            [
              ...previous,
              {
                action: search ? "search" : "view",
                ms: Math.round((performance.now() - start) * 10) / 10,
                cards: document.querySelectorAll(".cage-card").length,
                rows: document.querySelectorAll(".mouse-table tbody tr").length,
              },
            ].slice(-30),
          ),
        ),
      );
    };
    document.addEventListener("input", record, true);
    document.addEventListener("click", record, true);
    return () => {
      cancelAnimationFrame(raf.current);
      document.removeEventListener("input", record, true);
      document.removeEventListener("click", record, true);
    };
  }, []);
  const sample = () => {
    setRunning(true);
    const intervals: number[] = [];
    let start = 0,
      last = 0,
      maxScenes = 0,
      maxCharacters = 0,
      hidden = false;
    const frame = (now: number) => {
      if (!start) start = now;
      if (last) intervals.push(now - last);
      last = now;
      maxScenes = Math.max(
        maxScenes,
        document.querySelectorAll(".scene-running").length,
      );
      maxCharacters = Math.max(
        maxCharacters,
        document.querySelectorAll(".scene-running .scene-mouse").length,
      );
      hidden ||= document.hidden;
      if (now - start < 8000) {
        raf.current = requestAnimationFrame(frame);
        return;
      }
      const sorted = [...intervals].sort((a, b) => a - b);
      setFrames({
        rafFps: +((intervals.length * 1000) / (now - start)).toFixed(1),
        frameP95Ms: +(sorted[Math.floor(sorted.length * 0.95)] || 0).toFixed(1),
        worstFrameMs: +(sorted.at(-1) || 0).toFixed(1),
        samples: intervals.length,
        maxScenes,
        maxCharacters,
        hiddenDuringSample: hidden,
      });
      setRunning(false);
    };
    raf.current = requestAnimationFrame(frame);
  };
  return (
    <details
      open
      style={{
        position: "fixed",
        bottom: 12,
        right: 12,
        zIndex: 1000,
        width: 360,
        maxHeight: "55vh",
        overflow: "auto",
        padding: 12,
        background: "#fffdf9",
        border: "1px solid #b999a0",
        borderRadius: 12,
        boxShadow: "0 5px 24px #53332f22",
        fontSize: 12,
      }}
    >
      <summary>
        本地性能验收 · {state.cages.length} 笼 / {state.mice.length} 鼠
      </summary>
      <button
        type="button"
        className="button"
        onClick={sample}
        disabled={running}
      >
        {running ? "采样中…" : "开始 8 秒动效采样"}
      </button>
      <output style={{ display: "block" }} data-testid="performance-results">
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 11 }}>
          {JSON.stringify(
            {
              fixture: { cages: state.cages.length, mice: state.mice.length },
              viewport: {
                width: innerWidth,
                height: innerHeight,
                scale: devicePixelRatio,
              },
              firstInteractiveMs: readyMs,
              motion: state.settings.motion,
              frames,
              feedback,
            },
            null,
            2,
          )}
        </pre>
      </output>
    </details>
  );
}
createRoot(document.getElementById("root")!).render(
  <Provider>
    <App />
    <PerformanceProbe />
  </Provider>,
);
