type SceneEntry = {
  eligible: boolean;
  priority: number;
  order: number;
  serial: number;
  active: boolean;
  notify: (active: boolean) => void;
};

export class SceneBudget {
  private entries = new Map<string, SceneEntry>();
  private serial = 0;
  constructor(private limit = 6) {}

  register(id: string, notify: (active: boolean) => void) {
    const old = this.entries.get(id);
    if (old?.active) old.notify(false);
    const entry: SceneEntry = {
      eligible: false,
      priority: 0,
      order: 0,
      serial: this.serial++,
      active: false,
      notify,
    };
    this.entries.set(id, entry);
    this.rebalance();
    return () => {
      if (this.entries.get(id) !== entry) return;
      if (entry.active) entry.notify(false);
      this.entries.delete(id);
      this.rebalance();
    };
  }

  update(id: string, eligible: boolean, priority: number, order: number) {
    const entry = this.entries.get(id);
    if (!entry) return;
    Object.assign(entry, { eligible, priority, order });
    this.rebalance();
  }

  private rebalance() {
    const selected = new Set(
      [...this.entries.entries()]
        .filter(([, entry]) => entry.eligible)
        .sort(
          (a, b) =>
            b[1].priority - a[1].priority ||
            (a[1].priority
              ? b[1].serial - a[1].serial
              : a[1].order - b[1].order) ||
            a[1].serial - b[1].serial,
        )
        .slice(0, this.limit)
        .map(([id]) => id),
    );
    // Release slots before activating replacements; observers never see > limit.
    for (const [id, entry] of this.entries)
      if (entry.active && !selected.has(id)) {
        entry.active = false;
        entry.notify(false);
      }
    for (const [id, entry] of this.entries)
      if (!entry.active && selected.has(id)) {
        entry.active = true;
        entry.notify(true);
      }
  }
}

export const sceneBudget = new SceneBudget(6);
