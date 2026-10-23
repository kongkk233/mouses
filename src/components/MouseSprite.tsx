import { useEffect, useRef, useState, type CSSProperties } from "react";
import type { Appearance, Cage, Mouse } from "../../shared/types";
import { useApp } from "../context";
import { cageMembers } from "../selectors";
export type Pose =
  "idle" | "sleep" | "eat" | "explore" | "drink" | "groom" | "stretch" | "baby";
export function MouseSprite({
  mouse,
  appearance,
  pose = "idle",
  className = "",
  style,
}: {
  mouse?: Mouse;
  appearance?: Appearance;
  pose?: Pose;
  className?: string;
  style?: CSSProperties;
}) {
  const a = appearance || mouse?.appearance;
  const coat = a?.coat || "cream";
  const [failed, setFailed] = useState(false);
  const source = `/assets/mice/${coat}-${pose}.webp`;
  const shape = {
    ...style,
    "--body-scale": a?.body === "slender" ? ".94" : "1.04",
    "--ear-scale": a?.ears === "large" ? "1.035" : "1",
    "--face-scale": a?.face === "pointed" ? "1.02" : "1",
    "--tail-scale": a?.tail === "long" ? "1.03" : "1",
  } as CSSProperties;
  return (
    <span
      className={`mouse-sprite pattern-${a?.pattern || "solid"} eyes-${a?.eyes || "black"} ${className}`}
      style={shape}
    >
      <img
        src={failed ? "/icons/icon-192.png" : source}
        onError={() => setFailed(true)}
        alt=""
        draggable="false"
      />
      {a?.pattern !== "solid" && (
        <span
          className="fur-pattern"
          style={{
            maskImage: `url(${source})`,
            WebkitMaskImage: `url(${source})`,
          }}
        />
      )}
    </span>
  );
}
const routine: Pose[] = [
  "sleep",
  "idle",
  "eat",
  "groom",
  "explore",
  "stretch",
  "drink",
  "idle",
];
const actionLabels: Record<Pose, string> = {
  idle: "发呆",
  sleep: "呼呼睡",
  eat: "嚼嚼燕麦",
  explore: "好奇探索",
  drink: "喝口水",
  groom: "洗洗小脸",
  stretch: "伸个懒腰",
  baby: "依偎休息",
};
const spots: Record<string, [number, number]> = {
  sleep: [22, 61],
  idle: [49, 65],
  eat: [77, 71],
  groom: [56, 70],
  explore: [48, 73],
  stretch: [49, 74],
  drink: [83, 48],
  baby: [27, 75],
};
export function CageScene({
  cage,
  index = 0,
  large = false,
  onSelect,
  highlightIds = [],
}: {
  cage: Cage;
  index?: number;
  large?: boolean;
  onSelect?: (id: string) => void;
  highlightIds?: string[];
}) {
  const { state, open } = useApp(),
    ref = useRef<HTMLDivElement>(null),
    [visible, setVisible] = useState(false),
    [pageVisible, setPageVisible] = useState(!document.hidden),
    [tick, setTick] = useState(0),
    [focused, setFocused] = useState<string | null>(null);
  const all = cageMembers(state, cage.id),
    shown = all.slice(
      0,
      all.some((m) => m.weaningStatus === "unweaned") ? 6 : 4,
    );
  const reduced = useRef(window.matchMedia("(prefers-reduced-motion: reduce)")),
    [systemReduced, setSystemReduced] = useState(reduced.current.matches);
  useEffect(() => {
    const media = reduced.current;
    const change = () => setSystemReduced(media.matches);
    media.addEventListener("change", change);
    return () => media.removeEventListener("change", change);
  }, []);
  const active =
    visible &&
    pageVisible &&
    state.settings.motion !== "static" &&
    !systemReduced &&
    index < 6;
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => setVisible(entries[0].isIntersecting),
      { threshold: 0.1 },
    );
    if (ref.current) observer.observe(ref.current);
    const change = () => setPageVisible(!document.hidden);
    document.addEventListener("visibilitychange", change);
    return () => {
      observer.disconnect();
      document.removeEventListener("visibilitychange", change);
    };
  }, []);
  useEffect(() => {
    if (!active || focused) return;
    const id = setInterval(
      () => setTick((v) => v + 1),
      2600 + (index % 3) * 300,
    );
    return () => clearInterval(id);
  }, [active, index, focused]);
  const poses = shown.map((m, i): Pose => {
    const phase = active
      ? Math.floor((tick + i) / Math.max(1, shown.length))
      : 0;
    if (m.weaningStatus === "unweaned") return "baby";
    if (m.weaningStatus === "unknown")
      return (["idle", "sleep", "groom"] as Pose[])[
        (Math.floor(m.avatarSeed % 3) + phase) % 3
      ];
    const nursing = state.litters.some(
      (l) => l.nursing && (l.fosterMotherId || l.motherId) === m.id,
    );
    if (nursing) return "sleep";
    return routine[((m.avatarSeed % 8) + i * 2 + phase) % routine.length];
  });
  // Occupancy slots: only one drinking/eating position, at most two moving mice.
  const taken = new Set<string>();
  let walkers = 0;
  poses.forEach((pose, i) => {
    if (
      (pose === "drink" || pose === "eat" || pose === "explore") &&
      taken.has(pose)
    )
      poses[i] = "idle";
    if (poses[i] === "explore" && ++walkers > 2) poses[i] = "idle";
    taken.add(poses[i]);
  });
  return (
    <div
      ref={ref}
      className={`cage-scene theme-${index % 3} ${large ? "large" : ""} ${active ? "scene-running" : "scene-paused"} motion-${state.settings.motion}`}
      aria-label={`${cage.code} 的 ${all.length} 只鼠鼠，动作是趣味演绎`}
    >
      <div className="scene-warmth" />
      {!all.length && (
        <div className="empty-scene">
          <span>一个安静的小窝</span>
        </div>
      )}
      {shown.map((m, i) => {
        const pose = poses[i],
          isBaby = pose === "baby";
        let [x, y] = spots[pose];
        if (pose === "idle") {
          x = 35 + (i % 3) * 15;
          y = 64 + (i % 2) * 12;
        }
        if (pose === "sleep") {
          x = 21 + (i % 2) * 13;
          y = 58 + (i % 2) * 16;
        }
        if (isBaby) {
          x = 27 + (i % 3) * 12;
          y = 75 + Math.floor(i / 3) * 7;
        }
        if (pose === "groom" || pose === "stretch") {
          x = 40 + (i % 2) * 16;
          y = 70 + (i % 2) * 4;
        }
        return (
          <button
            key={m.id}
            className={`scene-mouse pose-${pose} ${isBaby ? "baby" : ""} ${focused === m.id ? "selected" : ""} ${highlightIds.includes(m.id) ? "search-match" : ""}`}
            style={
              {
                left: `${x}%`,
                top: `${y}%`,
                "--delay": `${-(m.avatarSeed % 20)}s`,
                "--wander": `${i % 2 ? 14 : -14}px`,
                zIndex: Math.round(y),
              } as CSSProperties
            }
            aria-label={`${m.code}${m.nickname ? ` · ${m.nickname}` : ""}，${actionLabels[pose]}（趣味动作）`}
            onMouseEnter={() => {
              setFocused(m.id);
              onSelect?.(m.id);
            }}
            onMouseLeave={() => {
              setFocused(null);
              onSelect?.("");
            }}
            onFocus={() => {
              setFocused(m.id);
              onSelect?.(m.id);
            }}
            onBlur={() => {
              setFocused(null);
              onSelect?.("");
            }}
            onClick={() => open({ kind: "mouse", id: m.id })}
          >
            <MouseSprite mouse={m} pose={pose} />
            <span className="mouse-name-bubble">
              {m.code} · {m.nickname || actionLabels[pose]}
            </span>
            {pose === "sleep" && (
              <span className="sleep-letters" aria-hidden="true">
                z<span>z</span>
              </span>
            )}
          </button>
        );
      })}
      {all.length > shown.length && (
        <button
          className="scene-overflow"
          onClick={() => open({ kind: "cage", id: cage.id })}
        >
          另有 {all.length - shown.length} 只
        </button>
      )}
    </div>
  );
}
