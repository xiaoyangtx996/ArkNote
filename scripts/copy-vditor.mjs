import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const src = path.join(root, 'node_modules', 'vditor', 'dist')
const dest = path.join(root, 'public', 'vditor', 'dist')

if (!fs.existsSync(src)) {
  console.error('vditor dist not found:', src)
  process.exit(1)
}

fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.cpSync(src, dest, { recursive: true })
console.log('Copied vditor assets -> public/vditor/dist')
