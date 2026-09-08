# ArkNote Knowledge

## Branding & icons

- Product: **ArkNote**, identifier `com.arknote.app`.
- Size marks live in `branding/exported-layers/arknote-{n}x{n}.png`; `npm run icons` writes tray/window icons and `public/logo.png` (mark + wordmark for About).
- Tray bitmap must **fill** 32×32 (no large transparent padding).

## Notes storage

- Authority path: `Documents/ArkNote/` (`index.json`, `note-{id}.md`, `note-{id}.assets/`).
- Selective sync: content → markdown file; geometry/pin/theme → index only (`MarkdownSync`).

## Window chrome

- Each note is a borderless transparent Tauri window (`skip_taskbar`, min **250×310** normally).
- Pin → `set_always_on_top`.
- Settings (`app_data/settings.json`): `lastNoteClose`, `newNotePinned` (托盘「新建便签默认置顶」; `default_note` reads it on create).
- **Edge dock (pinned only):** near screen edges → animate to a compact horizontal tab (~100×32): `mark.png` + title; rounded-md frosted white (not pill / no sky border). Collapse switches to bookmark chrome **before** size morph; expand shows note chrome first. Edge-anchored async animation (~320ms). Hide geometry not persisted.

## Editor

- Vditor IR; images as relative `{name}.assets/...` paths.
- Selection auto-copy on mouseup; 「已复制」floats at **selection end** inside the editor (~1.2s), not in the note header.
- Editor scrollbar: flush to the right (no right padding); **hidden until** `.note-live-editor` hover/focus-within; thin light thumb.
