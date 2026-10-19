const fs = require("fs/promises");
const path = require("path");
const sharp = require("sharp");

function bmp24(width, height, rgb) {
  const rowStride = Math.ceil((width * 3) / 4) * 4;
  const pixelSize = rowStride * height;
  const buf = Buffer.alloc(54 + pixelSize);
  buf.write("BM", 0);
  buf.writeUInt32LE(buf.length, 2);
  buf.writeUInt32LE(54, 10);
  buf.writeUInt32LE(40, 14);
  buf.writeInt32LE(width, 18);
  buf.writeInt32LE(height, 22);
  buf.writeUInt16LE(1, 26);
  buf.writeUInt16LE(24, 28);
  buf.writeUInt32LE(pixelSize, 34);
  for (let y = 0; y < height; y += 1) {
    const srcY = height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const si = (srcY * width + x) * 3;
      const di = 54 + y * rowStride + x * 3;
      buf[di] = rgb[si + 2];
      buf[di + 1] = rgb[si + 1];
      buf[di + 2] = rgb[si];
    }
  }
  return buf;
}

async function raster(width, height, layers) {
  const { data, info } = await sharp({
    create: { width, height, channels: 4, background: "#111111" },
  })
    .composite(layers)
    .flatten({ background: "#111111" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (info.channels !== 3 || info.width !== width || info.height !== height) {
    throw new Error(`Unexpected installer bitmap ${info.width}x${info.height}x${info.channels}`);
  }
  return bmp24(width, height, data);
}

async function main() {
  const root = path.resolve(__dirname, "..");
  const iconPng = path.join(root, "build-resources", "icon.png");
  const outDir = path.join(root, "build-resources");
  await fs.mkdir(outDir, { recursive: true });

  const logo = await sharp(iconPng)
    .resize(132, 132, { fit: "contain", background: "#111111" })
    .png()
    .toBuffer();
  const sidebarCaption = Buffer.from(`<svg width="164" height="78" xmlns="http://www.w3.org/2000/svg">
    <rect width="164" height="78" fill="#111111"/>
    <rect x="46" y="4" width="72" height="2" fill="#C59D5F"/>
    <text x="82" y="28" text-anchor="middle" fill="#F3E6C4" font-family="Segoe UI, Arial" font-size="13" font-weight="700">Sparkle RFID</text>
    <text x="82" y="48" text-anchor="middle" fill="#C59D5F" font-family="Segoe UI, Arial" font-size="10">Tray · Tags · Stock</text>
    <text x="82" y="68" text-anchor="middle" fill="#8A8172" font-family="Segoe UI, Arial" font-size="9">Dashboard setup</text>
  </svg>`);
  const goldBar = Buffer.from(`<svg width="164" height="6" xmlns="http://www.w3.org/2000/svg"><rect width="164" height="6" fill="#C59D5F"/></svg>`);

  const sidebar = await raster(164, 314, [
    { input: goldBar, top: 0, left: 0 },
    { input: logo, top: 28, left: 16 },
    { input: sidebarCaption, top: 214, left: 0 },
  ]);

  const headerLogo = await sharp(iconPng)
    .resize(118, 50, { fit: "contain", background: "#111111" })
    .png()
    .toBuffer();
  const headerBar = Buffer.from(`<svg width="150" height="57" xmlns="http://www.w3.org/2000/svg"><rect width="150" height="57" fill="#111111"/><rect width="4" height="57" fill="#C59D5F"/></svg>`);
  const header = await raster(150, 57, [
    { input: headerBar, top: 0, left: 0 },
    { input: headerLogo, top: 3, left: 18 },
  ]);

  const sidebarPath = path.join(outDir, "installerSidebar.bmp");
  const headerPath = path.join(outDir, "installerHeader.bmp");
  await fs.writeFile(sidebarPath, sidebar);
  await fs.writeFile(headerPath, header);
  console.log(`Generated ${sidebarPath}`);
  console.log(`Generated ${headerPath}`);
}

main().catch((error) => {
  console.error("Failed to generate installer art:", error);
  process.exit(1);
});
