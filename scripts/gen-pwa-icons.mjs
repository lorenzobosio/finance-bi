// scripts/gen-pwa-icons.mjs — the committed one-shot PWA icon generator (PWA-01, D-03).
//
// ZERO external fetch, ZERO new dependency: emits the five brand PNGs using ONLY the Node
// built-in `zlib` (deflate) + a hand-rolled PNG encoder, reading the brand colours from the
// already-present `culori`. Mirrors the scripts/gen-calendar.ts idiom — documented, deterministic,
// output committed to the repo (public/icons/), re-runnable to reproduce byte-for-byte.
//
// The glyph is a blocky monogram "F" (the "Finance BI" wordmark's initial) — filled rectangles,
// NO font rasterizer needed. Colours come from src/app/globals.css tokens (`--brand` field,
// `--brand-fg` glyph) converted oklch → sRGB via culori — the exact token, never a hand-picked hex
// (D-03). Maskable icons keep the glyph inside the central 80% safe zone; apple-touch is fully
// opaque (iOS blackens alpha). All five are opaque RGB (colour type 2) — the OS masks/rounds the
// square field itself, so no alpha channel is needed.
//
// Run: `node scripts/gen-pwa-icons.mjs` (from repo root). Prints the files it wrote.

import { deflateSync } from "node:zlib";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { rgb } from "culori";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const ICONS_DIR = join(ROOT, "public", "icons");

// --- Read the brand tokens from globals.css (do NOT hand-pick the violet hex) ------------------
const css = readFileSync(join(ROOT, "src", "app", "globals.css"), "utf8");
function readToken(name) {
  // Match `--name:` exactly (the trailing colon avoids matching `--brand-muted` for `--brand`).
  const m = css.match(new RegExp(`--${name}:\\s*(oklch\\([^)]*\\))`));
  if (!m) throw new Error(`token --${name} not found in globals.css`);
  return m[1];
}
function toSrgb(oklchStr) {
  const c = rgb(oklchStr);
  const clamp = (v) => Math.max(0, Math.min(1, v));
  return [Math.round(clamp(c.r) * 255), Math.round(clamp(c.g) * 255), Math.round(clamp(c.b) * 255)];
}
const BRAND = toSrgb(readToken("brand")); // solid field
const BRAND_FG = toSrgb(readToken("brand-fg")); // white "F" glyph

// --- Minimal PNG encoder (opaque RGB, colour type 2, filter 0) ---------------------------------
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}
function encodePng(width, height, pixelFn) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolour (RGB, opaque)
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // filter method 0
  ihdr[12] = 0; // no interlace
  // Raw scanlines: 1 filter byte (0 = none) + width*3 bytes per row.
  const raw = Buffer.alloc(height * (1 + width * 3));
  let o = 0;
  for (let y = 0; y < height; y++) {
    raw[o++] = 0; // filter: none
    for (let x = 0; x < width; x++) {
      const [r, g, b] = pixelFn(x, y);
      raw[o++] = r;
      raw[o++] = g;
      raw[o++] = b;
    }
  }
  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// --- The blocky "F" monogram -------------------------------------------------------------------
// glyphScale = fraction of the icon the glyph box spans. Maskable uses a smaller box so the glyph
// stays inside the central 80% safe zone the platform mask may crop to.
function makePixelFn(size, glyphScale) {
  const boxH = size * glyphScale;
  const boxW = boxH * 0.66; // F is taller than wide
  const bx0 = (size - boxW) / 2;
  const by0 = (size - boxH) / 2;
  const isF = (u, v) => {
    if (u < 0.28) return true; // left stem (full height)
    if (v < 0.22) return true; // top bar (full width)
    if (v >= 0.4 && v <= 0.6 && u < 0.82) return true; // middle bar
    return false;
  };
  return (x, y) => {
    const u = (x - bx0) / boxW;
    const v = (y - by0) / boxH;
    if (u >= 0 && u <= 1 && v >= 0 && v <= 1 && isF(u, v)) return BRAND_FG;
    return BRAND;
  };
}

// --- Emit the five icons -----------------------------------------------------------------------
mkdirSync(ICONS_DIR, { recursive: true });
const icons = [
  { file: "icon-192.png", size: 192, glyphScale: 0.52 },
  { file: "icon-512.png", size: 512, glyphScale: 0.52 },
  { file: "icon-maskable-192.png", size: 192, glyphScale: 0.44 }, // glyph inside 80% safe zone
  { file: "icon-maskable-512.png", size: 512, glyphScale: 0.44 },
  { file: "apple-touch-icon.png", size: 180, glyphScale: 0.52 }, // opaque (RGB) — iOS blackens alpha
];
for (const { file, size, glyphScale } of icons) {
  const png = encodePng(size, size, makePixelFn(size, glyphScale));
  writeFileSync(join(ICONS_DIR, file), png);
  console.log(`wrote public/icons/${file} (${size}x${size}, ${png.length} bytes)`);
}
console.log(`brand field rgb(${BRAND.join(",")}) · glyph rgb(${BRAND_FG.join(",")})`);
