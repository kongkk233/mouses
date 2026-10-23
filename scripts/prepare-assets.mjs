import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
await mkdir("public/assets/mice", { recursive: true });
const coats = ["ivory", "cream", "silver", "cocoa"];
const sheets = [
  ["mouse-atlas-source.png", ["idle", "sleep", "eat", "explore"]],
  ["mouse-actions-source.png", ["drink", "groom", "stretch", "baby"]],
];
const version = createHash("sha256");
const spriteParts = {};
function features(data, size, predicate) {
  const seen = new Uint8Array(size * size),
    queue = new Int32Array(size * size),
    found = [];
  for (let p = 0; p < seen.length; p++) {
    if (seen[p] || !predicate(p)) continue;
    let head = 0,
      tail = 1,
      left = size,
      top = size,
      right = 0,
      bottom = 0;
    seen[p] = 1;
    queue[0] = p;
    while (head < tail) {
      const at = queue[head++],
        x = at % size,
        y = Math.floor(at / size);
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      for (const next of [
        x ? at - 1 : -1,
        x < size - 1 ? at + 1 : -1,
        y ? at - size : -1,
        y < size - 1 ? at + size : -1,
      ])
        if (next >= 0 && !seen[next] && predicate(next)) {
          seen[next] = 1;
          queue[tail++] = next;
        }
    }
    found.push({
      area: tail,
      x: (left + right) / 2,
      y: (top + bottom) / 2,
      width: right - left + 1,
      height: bottom - top + 1,
    });
  }
  return found;
}
async function locateParts(image, pose) {
  const size = 320,
    data = await sharp(image).ensureAlpha().raw().toBuffer();
  const open = ["idle", "eat", "explore", "drink", "groom"].includes(pose);
  const eyes = open
    ? features(data, size, (p) => {
        const o = p * 4,
          x = p % size,
          y = Math.floor(p / size);
        return (
          x > size * 0.22 &&
          x < size * 0.86 &&
          y > size * 0.15 &&
          y < size * 0.68 &&
          data[o + 3] > 240 &&
          Math.max(data[o], data[o + 1], data[o + 2]) < 55
        );
      })
        .filter(
          (p) =>
            p.area >= 16 &&
            p.width >= 4 &&
            p.height >= 3 &&
            p.width / p.height > 0.6 &&
            p.width / p.height < 1.8,
        )
        .sort((a, b) => b.area - a.area)
        .slice(0, 2)
    : [];
  const eye = eyes[0];
  const ears = features(data, size, (p) => {
    const o = p * 4;
    return (
      data[o + 3] > 200 &&
      data[o] > 110 &&
      data[o] > data[o + 1] * 1.18 &&
      data[o] > data[o + 2] * 1.15 &&
      data[o + 2] > data[o + 1] * 0.87
    );
  })
    .filter(
      (p) =>
        p.area >= 120 &&
        Math.min(p.width, p.height) >= 12 &&
        p.width / p.height > 0.65 &&
        p.width / p.height < 1.7 &&
        p.y < size * 0.8 &&
        (eye
          ? p.x > eye.x - 105 &&
            p.x < eye.x + 45 &&
            p.y > eye.y - 90 &&
            p.y < eye.y + 20
          : p.x > size * 0.35),
    )
    .sort((a, b) => b.area - a.area)
    .slice(0, 2);
  if ((open && !eyes.length) || !ears.length)
    throw new Error(
      `Inspect ${pose}: an eye or ear could not be located safely.`,
    );
  const percent = (parts, padding) =>
    parts.map((p) => ({
      x: +((p.x / size) * 100).toFixed(3),
      y: +((p.y / size) * 100).toFixed(3),
      width: +(((p.width + padding) / size) * 100).toFixed(3),
      height: +(((p.height + padding) / size) * 100).toFixed(3),
    }));
  return { eyes: percent(eyes, 0.5), ears: percent(ears, 10) };
}
// Generated atlases are only approximately aligned. Isolate the actual alpha
// components before framing them, so a neighbouring paw cannot enter a tile.
function characters(data, width, height) {
  const total = width * height,
    seen = new Uint8Array(total),
    labels = new Uint16Array(total),
    distance = new Uint8Array(total),
    queue = new Int32Array(total),
    parts = [];
  const neighbours = (p) => {
    const x = p % width,
      y = Math.floor(p / width);
    return [
      x ? p - 1 : -1,
      x < width - 1 ? p + 1 : -1,
      y ? p - width : -1,
      y < height - 1 ? p + width : -1,
    ];
  };
  for (let p = 0; p < total; p++) {
    if (seen[p] || data[p * 4 + 3] < 100) continue;
    let head = 0,
      tail = 1,
      minX = width,
      minY = height,
      maxX = 0,
      maxY = 0;
    queue[0] = p;
    seen[p] = 1;
    while (head < tail) {
      const at = queue[head++],
        x = at % width,
        y = Math.floor(at / width);
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      for (const next of neighbours(at))
        if (next >= 0 && !seen[next] && data[next * 4 + 3] >= 100) {
          seen[next] = 1;
          queue[tail++] = next;
        }
    }
    if (tail < 5000) continue;
    const id = parts.length + 1;
    for (let i = 0; i < tail; i++) labels[queue[i]] = id;
    parts.push({ id, minX, minY, maxX, maxY });
  }
  if (parts.length !== 16)
    throw new Error(
      `Expected 16 isolated mice; found ${parts.length}. Inspect the atlas before rebuilding.`,
    );
  // Grow into the original antialiased fur and whiskers. Multi-source growth
  // preserves their RGBA values and cannot claim another mouse's opaque core.
  let head = 0,
    tail = 0;
  for (let p = 0; p < total; p++) if (labels[p]) queue[tail++] = p;
  while (head < tail) {
    const at = queue[head++];
    if (distance[at] >= 24) continue;
    for (const next of neighbours(at))
      if (next >= 0 && !labels[next] && data[next * 4 + 3] > 0) {
        labels[next] = labels[at];
        distance[next] = distance[at] + 1;
        queue[tail++] = next;
      }
  }
  const byRow = parts.sort((a, b) => a.minY - b.minY);
  return {
    labels,
    parts: Array.from({ length: 4 }, (_, row) =>
      byRow.slice(row * 4, row * 4 + 4).sort((a, b) => a.minX - b.minX),
    ).flat(),
  };
}
for (const [source, poses] of sheets) {
  const { data, info } = await sharp(`design/source/${source}`)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { labels, parts } = characters(data, info.width, info.height);
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      const part = parts[y * 4 + x],
        left = Math.max(0, part.minX - 24),
        top = Math.max(0, part.minY - 24),
        right = Math.min(info.width - 1, part.maxX + 24),
        bottom = Math.min(info.height - 1, part.maxY + 24),
        width = right - left + 1,
        height = bottom - top + 1,
        pixels = Buffer.alloc(width * height * 4),
        side = Math.max(Math.ceil(info.width / 4), width, height);
      for (let py = 0; py < height; py++)
        for (let px = 0; px < width; px++) {
          const original = (top + py) * info.width + left + px;
          if (labels[original] === part.id)
            data.copy(
              pixels,
              (py * width + px) * 4,
              original * 4,
              original * 4 + 4,
            );
        }
      const frame = await sharp({
        create: {
          width: side,
          height: side,
          channels: 4,
          background: "#00000000",
        },
      })
        .composite([
          {
            input: pixels,
            raw: { width, height, channels: 4 },
            left: Math.floor((side - width) / 2),
            top: side - height,
          },
        ])
        .png()
        .toBuffer();
      const image = await sharp(frame)
        .resize(320, 320)
        .webp({ quality: 86, alphaQuality: 95 })
        .toBuffer();
      version.update(image);
      spriteParts[`${coats[y]}-${poses[x]}`] = await locateParts(
        image,
        poses[x],
      );
      await writeFile(`public/assets/mice/${coats[y]}-${poses[x]}.webp`, image);
    }
}
await writeFile(
  "shared/generated-assets.ts",
  `// Generated by scripts/prepare-assets.mjs.\nexport const SPRITE_VERSION = "${version.digest("hex").slice(0, 12)}";\nexport const SPRITE_PARTS: Record<string, { eyes: { x: number; y: number; width: number; height: number }[]; ears: { x: number; y: number; width: number; height: number }[] }> = ${JSON.stringify(spriteParts, null, 2)};\n`,
);
for (const size of [192, 512]) {
  const pic = await sharp("public/assets/mice/cream-idle.webp")
    .resize(Math.round(size * 0.82))
    .png()
    .toBuffer();
  await sharp({
    create: { width: size, height: size, channels: 4, background: "#f5e7df" },
  })
    .composite([{ input: pic, gravity: "centre" }])
    .png()
    .toFile(`public/icons/icon-${size}.png`);
}
await sharp("design/source/habitat-source.png")
  .resize(1080)
  .webp({ quality: 85 })
  .toFile("public/assets/habitat.webp");
console.log("Prepared 32 sprite assets and PWA icons.");
