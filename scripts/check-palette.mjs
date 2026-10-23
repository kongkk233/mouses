import { readFileSync, writeFileSync } from "node:fs";
const path = "src/styles.css";
let css = readFileSync(path, "utf8");
const rgb = (hex) => {
  hex = hex.slice(1);
  if (hex.length === 3)
    hex = hex
      .split("")
      .map((x) => x + x)
      .join("");
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
};
const lum = (c) => {
  const v = c.map((v) => {
    v /= 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
const bg = lum(rgb("#f8f2eb"));
let count = 0;
css = css.replace(
  /(?<![-\w])color:\s*(#[0-9a-f]{3,8})(?=[;\s}])/gi,
  (match, hex) => {
    let c = rgb(hex);
    if (c.some(Number.isNaN) || lum(c) > 0.82) return match;
    while ((bg + 0.05) / (lum(c) + 0.05) < 4.7)
      c = c.map((v) => Math.max(0, Math.round(v * 0.97) - 1));
    const result = "#" + c.map((v) => v.toString(16).padStart(2, "0")).join("");
    if (result !== hex) count++;
    return "color: " + result;
  },
);
if (process.argv.includes("--fix")) {
  writeFileSync(path, css);
  console.log(
    `Adjusted ${count} foreground declarations for readable pastel surfaces.`,
  );
} else {
  console.log(`${count} low-contrast foreground declarations need review.`);
  if (count) process.exitCode = 1;
}
