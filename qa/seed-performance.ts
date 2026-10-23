import { Store } from "../server/store.js";
import { applyCommand, reconcile } from "../server/domain.js";
import { addDays } from "../shared/dates.js";
const cages = Number(process.argv[2] || 20),
  mice = Number(process.argv[3] || 100);
if (
  !Number.isInteger(cages) ||
  !Number.isInteger(mice) ||
  cages < 1 ||
  cages > 200 ||
  mice < 1 ||
  mice > 1000 ||
  mice > cages * 8
)
  throw new Error("使用 1–200 笼、1–1000 鼠，每笼不超过 8 只的独立验收库");
if (!process.env.DATA_DIR?.startsWith("artifacts/"))
  throw new Error("DATA_DIR 必须显式指定 artifacts/ 内的独立验收目录");
const store = new Store();
try {
  store.transaction(() => {
    const state = store.read();
    if (state.cages.length || state.mice.length)
      throw new Error("验收目录已有数据，请选择新目录");
    for (let i = 0; i < cages; i++)
      applyCommand(state, "cage.create", {
        code: `C${String(i + 1).padStart(3, "0")}`,
        capacity: 8,
      });
    for (let i = 0; i < mice; i++)
      applyCommand(state, "mouse.create", {
        code: `M${String(i + 1).padStart(4, "0")}`,
        nickname: `小鼠${i + 1}`,
        cageId: state.cages[i % cages].id,
        dob: addDays(state.today, -(i % 7 === 0 ? 8 : 70 + (i % 130))),
        genotype: i % 2 ? "WT" : "Het",
        sex: i % 2 ? "male" : "female",
        weaningStatus: i % 7 === 0 ? "unweaned" : "weaned",
        personality: ["好奇", "安静", "爱睡", "爱筑巢", "贪吃", "社交"][i % 6],
        avatarSeed: 20000 + i * 137,
      });
    state.demo = true;
    reconcile(state);
    store.save(state);
    console.log(`已创建独立性能验收库：${cages} 笼 / ${mice} 鼠`);
  });
} finally {
  store.close();
}
