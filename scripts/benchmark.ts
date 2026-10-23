import { performance } from "node:perf_hooks";
import { Store } from "../server/store.js";
import { emptyState, applyCommand, reconcile } from "../server/domain.js";
import { addDays } from "../shared/dates.js";
for (const [cages, mice] of [
  [20, 100],
  [200, 1000],
]) {
  const store = new Store(":memory:"),
    s = emptyState();
  try {
    for (let i = 0; i < cages; i++)
      applyCommand(s, "cage.create", { code: `C${i}`, capacity: 8 });
    for (let i = 0; i < mice; i++)
      applyCommand(s, "mouse.create", {
        code: `M${i}`,
        cageId: s.cages[i % cages].id,
        dob: addDays(s.today, -i % 200),
        genotype: i % 2 ? "WT" : "Het",
      });
    reconcile(s);
    store.save(s);
    const times: number[] = [];
    for (let i = 0; i < 20; i++) {
      const t = performance.now();
      store.snapshot();
      times.push(performance.now() - t);
    }
    times.sort((a, b) => a - b);
    const t = performance.now();
    for (let i = 0; i < 100; i++)
      s.mice.filter((m) => m.code.includes("9") || m.genotype === "WT");
    console.log(
      JSON.stringify({
        cages,
        mice,
        snapshotMedianMs: +times[10].toFixed(2),
        snapshotP95Ms: +times[19].toFixed(2),
        searchMeanMs: +((performance.now() - t) / 100).toFixed(3),
        jsonKB: +(Buffer.byteLength(JSON.stringify(s)) / 1024).toFixed(1),
      }),
    );
  } finally {
    store.close();
  }
}
