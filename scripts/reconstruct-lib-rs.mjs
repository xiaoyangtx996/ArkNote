import fs from 'fs'

const transcript = fs.readFileSync(
  'C:/Users/xufan/.cursor/projects/d-workspace-XYTX-TextTop/agent-transcripts/619a9f65-b955-48dc-83ae-c25893affe74/619a9f65-b955-48dc-83ae-c25893affe74.jsonl',
  'utf8',
)

const target = 'd:/workspace/XYTX/TextTop/src-tauri/src/lib.rs'
let content = null

for (const line of transcript.trim().split('\n')) {
  let obj
  try {
    obj = JSON.parse(line)
  } catch {
    continue
  }
  const items = obj.message?.content
  if (!Array.isArray(items)) continue

  for (const item of items) {
    if (item.type !== 'tool_use') continue
    const input = item.input ?? {}
    const path = input.path?.replace(/\\/g, '/')
    if (path !== target.replace(/\\/g, '/')) continue

    if (item.name === 'Write' && typeof input.contents === 'string') {
      content = input.contents
    }
    if (item.name === 'StrReplace' && content !== null) {
      const oldString = input.old_string
      const newString = input.new_string
      if (typeof oldString === 'string' && typeof newString === 'string' && content.includes(oldString)) {
        content = content.replace(oldString, newString)
      }
    }
  }
}

if (!content) {
  console.error('No lib.rs content reconstructed')
  process.exit(1)
}

fs.writeFileSync('d:/workspace/XYTX/TextTop/src-tauri/src/lib.rs', content, 'utf8')
console.log('reconstructed lib.rs', content.length, 'bytes')
