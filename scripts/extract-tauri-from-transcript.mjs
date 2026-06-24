import fs from 'fs'
import path from 'path'

const transcript = fs.readFileSync(
  'C:/Users/xufan/.cursor/projects/d-workspace-XYTX-TextTop/agent-transcripts/619a9f65-b955-48dc-83ae-c25893affe74/619a9f65-b955-48dc-83ae-c25893affe74.jsonl',
  'utf8',
)

const root = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..')
const writes = new Map()

for (const line of transcript.trim().split('\n')) {
  let obj
  try {
    obj = JSON.parse(line)
  } catch {
    continue
  }
  const content = obj.message?.content
  if (!Array.isArray(content)) continue

  for (const item of content) {
    if (item.type !== 'tool_use') continue
    const input = item.input ?? {}
    const filePath = input.path?.replace(/\\/g, '/')
    if (!filePath?.includes('src-tauri')) continue

    if (item.name === 'Write' && typeof input.contents === 'string') {
      writes.set(filePath, input.contents)
    }
  }
}

const wanted = [...writes.keys()].filter(p =>
  /\.(rs|toml|json)$/.test(p) &&
  !p.includes('/target/') &&
  (p.includes('/src/') ||
    p.endsWith('Cargo.toml') ||
    p.endsWith('build.rs') ||
    p.endsWith('tauri.conf.json') ||
    p.includes('/capabilities/') ||
    p.includes('/permissions/')),
)

for (const filePath of wanted.sort()) {
  const rel = filePath.split('TextTop/')[1]
  if (!rel) continue
  const dest = path.join(root, rel)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, writes.get(filePath), 'utf8')
  console.log('restored', rel)
}

console.log('total', wanted.length)
