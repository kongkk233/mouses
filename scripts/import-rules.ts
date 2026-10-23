import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Store } from "../server/store.js";
const path = process.argv[2];
if (!path)
  throw new Error(
    "用法：npm run rules:import -- /规则.json；仅导入经实验室核实的规则。",
  );
const schema = z
  .array(
    z
      .object({
        id: z.string().min(1).max(80),
        locus: z.string().min(1).max(80),
        version: z.string().min(1).max(80),
        strain: z.string().max(120),
        parentGenotypes: z.tuple([
          z.string().min(1).max(120),
          z.string().min(1).max(120),
        ]),
        allowedOffspring: z.array(z.string().min(1).max(120)).min(1).max(30),
        message: z.string().min(1).max(300),
      })
      .strict(),
  )
  .max(100);
const rules = schema.parse(JSON.parse(readFileSync(path, "utf8")));
if (new Set(rules.map((r) => r.id)).size !== rules.length)
  throw new Error("规则 ID 重复");
const store = new Store();
try {
  store.transaction(() => {
    const state = store.read();
    state.settings.geneticRules = rules;
    state.revision++;
    state.events.push({
      id: randomUUID(),
      type: "geneticRules.import",
      date: state.today,
      createdAt: new Date().toISOString(),
      mouseIds: [],
      cageIds: [],
      title: `导入 ${rules.length} 条实验室只读规则`,
      notes: "管理员主动导入，系统不自动修改任何基因型或亲缘。",
      details: { rules: rules.map((r) => ({ id: r.id, version: r.version })) },
    });
    store.save(state);
  });
  console.log(`已导入 ${rules.length} 条只读规则，未更改任何小鼠事实。`);
} finally {
  store.close();
}
