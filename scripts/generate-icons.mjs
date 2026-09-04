import sharp from 'sharp'
import path from 'path'
import { fileURLToPath } from 'url'
import fs from 'fs'
import { spawnSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.join(__dirname, '..')
const brandingDir = path.join(root, 'branding')
const layersDir = path.join(brandingDir, 'exported-layers')
const logoFullPng = path.join(brandingDir, 'arknote-logo.png')
const appIconPng = path.join(brandingDir, 'app-icon.png')
const iconsDir = path.join(root, 'src-tauri', 'icons')
const publicDir = path.join(root, 'public')

if (!fs.existsSync(logoFullPng)) {
  console.error('Missing branding/arknote-logo.png')
  process.exit(1)
}

await fs.promises.mkdir(iconsDir, { recursive: true })
await fs.promises.mkdir(publicDir, { recursive: true })

/** Prefer sheet-exported mark of exact size; else scale from largest master. */
function layerPath(size) {
  return path.join(layersDir, `arknote-${size}x${size}.png`)
}

const masterCandidates = [704, 371, 263, 238, 187, 128]
let masterPath = null
for (const s of masterCandidates) {
  const p = layerPath(s)
  if (fs.existsSync(p)) {
    masterPath = p
    break
  }
}
if (!masterPath) {
  console.error('Missing branding/exported-layers/arknote-*.png — run extract-logo-sheet.py first')
  process.exit(1)
}

async function markAt(size) {
  const exact = layerPath(size)
  if (fs.existsSync(exact)) {
    return sharp(exact).ensureAlpha().png().toBuffer()
  }
  return sharp(masterPath)
    .ensureAlpha()
    .resize(size, size, { fit: 'fill' })
    .png()
    .toBuffer()
}

/**
 * Full lockup (icon + "ArkNote" wordmark): flood-fill remove sheet black only
 * (keeps dark "Ark" glyphs), trim, write branding/logo.png + public/logo.png.
 */
async function buildLogoPng() {
  const { data, info } = await sharp(logoFullPng).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
  const { width: w, height: h, channels } = info
  const out = Buffer.from(data)
  const isBg = (pix) => {
    const i = pix * channels
    return Math.max(out[i], out[i + 1], out[i + 2]) <= 28
  }
  const visited = new Uint8Array(w * h)
  const q = []
  const push = (x, y) => {
    const idx = y * w + x
    if (visited[idx] || !isBg(idx)) return
    visited[idx] = 1
    q.push(idx)
  }
  for (let x = 0; x < w; x++) {
    push(x, 0)
    push(x, h - 1)
  }
  for (let y = 0; y < h; y++) {
    push(0, y)
    push(w - 1, y)
  }
  while (q.length) {
    const idx = q.pop()
    const x = idx % w
    const y = (idx / w) | 0
    out[idx * channels + 3] = 0
    if (x > 0) push(x - 1, y)
    if (x + 1 < w) push(x + 1, y)
    if (y > 0) push(x, y - 1)
    if (y + 1 < h) push(x, y + 1)
  }

  const trimmed = await sharp(out, { raw: { width: w, height: h, channels } })
    .png()
    .trim({ threshold: 16 })
    .toBuffer()

  await sharp(trimmed).png().toFile(path.join(brandingDir, 'logo.png'))
  await sharp(trimmed)
    .resize({ width: 480, height: 480, fit: 'inside', withoutEnlargement: true })
    .png()
    .toFile(path.join(publicDir, 'logo.png'))
  console.log('Wrote branding/logo.png + public/logo.png (mark + wordmark)')
}

// App mark master for tauri icon / exe
const mark1024 = await markAt(1024)
await sharp(mark1024).png().toFile(appIconPng)

// About uses public/logo.png (mark + wordmark)
await buildLogoPng()

// Tray: fill bitmap (Windows ~1:1)
await sharp(await markAt(32)).png().toFile(path.join(iconsDir, 'tray-icon.png'))
await sharp(await markAt(48)).png().toFile(path.join(iconsDir, 'tray-icon-48.png'))

// Place sizes for window / installer (prefer exact exported layers when present)
const sizeCopies = [
  [32, '32x32.png'],
  [64, '64x64.png'],
  [128, '128x128.png'],
  [256, '128x128@2x.png'],
]
for (const [size, name] of sizeCopies) {
  await sharp(await markAt(size)).png().toFile(path.join(iconsDir, name))
}

console.log(`Using mark master: ${path.basename(masterPath)}`)

const iconResult = spawnSync(
  'npx',
  ['--yes', '@tauri-apps/cli', 'icon', appIconPng, '-o', iconsDir],
  { cwd: root, shell: true, stdio: 'inherit' },
)
if (iconResult.status !== 0) {
  console.error('tauri icon failed')
  process.exit(iconResult.status ?? 1)
}

// Restore filled tray + preferred sheet sizes after `tauri icon` overwrites some pngs
await sharp(await markAt(32)).png().toFile(path.join(iconsDir, 'tray-icon.png'))
await sharp(await markAt(48)).png().toFile(path.join(iconsDir, 'tray-icon-48.png'))
for (const [size, name] of sizeCopies) {
  await sharp(await markAt(size)).png().toFile(path.join(iconsDir, name))
}

console.log('Generated ArkNote icons from exported-layers + public/logo.png')
