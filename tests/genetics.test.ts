import test from "node:test";
import assert from "node:assert/strict";
import { emptyState, applyCommand } from "../server/domain.js";
import { addDays } from "../shared/dates.js";
import { consistencyWarnings } from "../shared/genetics.js";
test("lab rules only warn for confirmed parents and do not overwrite facts", () => {
  const s = emptyState(),
    c = applyCommand(s, "cage.create", { code: "C" }).id;
  const mom = applyCommand(s, "mouse.create", {
    code: "MOM",
    cageId: c,
    dob: addDays(s.today, -100),
    sex: "female",
    genotype: "lab-A",
  }).id as string;
  const dad = applyCommand(s, "mouse.create", {
    code: "DAD",
    cageId: c,
    dob: addDays(s.today, -100),
    sex: "male",
    genotype: "lab-B",
  }).id as string;
  s.settings.geneticRules = [
    {
      id: "test",
      locus: "实验室测试位点",
      version: "v1",
      strain: "",
      parentGenotypes: ["lab-A", "lab-B"],
      allowedOffspring: ["lab-C"],
      message: "按人工配置的规则复核",
    },
  ];
  const mouse = {
    motherId: mom,
    fatherId: dad,
    motherStatus: "confirmed" as const,
    fatherStatus: "confirmed" as const,
    genotype: "lab-X",
    strain: "",
  };
  assert.equal(consistencyWarnings(s, mouse).length, 1);
  assert.equal(mouse.genotype, "lab-X");
  assert.equal(
    consistencyWarnings(s, { ...mouse, fatherStatus: "candidate" }).length,
    0,
  );
  assert.equal(
    consistencyWarnings(s, { ...mouse, genotype: "lab-C" }).length,
    0,
  );
});
