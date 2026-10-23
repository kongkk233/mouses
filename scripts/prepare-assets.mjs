import sharp from "sharp";
import { mkdir } from "node:fs/promises";
await mkdir("public/assets/mice", { recursive: true });
const coats = ["ivory", "cream", "silver", "cocoa"];
const sheets = [
  ["mouse-atlas-source.png", ["idle", "sleep", "eat", "explore"]],
  ["mouse-actions-source.png", ["drink", "groom", "stretch", "baby"]],
];
for (const [source, poses] of sheets) {
  const file = `design/source/${source}`,
    meta = await sharp(file).metadata();
  for (let y = 0; y < 4; y++)
    for (let x = 0; x < 4; x++) {
      const left = Math.round((x * meta.width) / 4),
        top = Math.round((y * meta.height) / 4);
      await sharp(file)
        .extract({
          left,
          top,
          width: Math.round(((x + 1) * meta.width) / 4) - left,
          height: Math.round(((y + 1) * meta.height) / 4) - top,
        })
        .resize(320, 320, { fit: "contain", background: "#00000000" })
        .webp({ quality: 86, alphaQuality: 95 })
        .toFile(`public/assets/mice/${coats[y]}-${poses[x]}.webp`);
    }
}
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
