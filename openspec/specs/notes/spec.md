# Notes capability

Behavioral specs extracted from ArkNote runtime (Rust `NotesStore` + React note windows).
These describe **current** behavior; they are not aspirational redesigns.

## Requirement: Active note is authoritative in memory

- **id**: notes.memory-authority
- **enforced**: true
- **entities**: Note, StoredNotes, NotesStore
- **Given** multiple note windows patch concurrently
- **When** each calls `patch_note_cmd`
- **Then** updates apply under one `NotesStore` mutex and persist from the locked snapshot
- **And** clients must not load-modify-write whole `index.json` independently

## Requirement: Documents folder layout

- **id**: notes.documents-layout
- **enforced**: true
- **entities**: NoteDocument
- **Given** the app runs on desktop
- **When** notes are persisted
- **Then** files live under `Documents/ArkNote/` as `index.json`, `note-{id}.md`, and `note-{id}.assets/`
- **And** legacy `%APPDATA%/com.texttop.app/notes.json` is only a one-time migration source

## Requirement: Close with content recycles

- **id**: notes.close-with-content
- **enforced**: true
- **test**: `close_note_with_content_moves_to_closed_list`
- **Given** an active note whose content is non-empty after trim
- **When** the note is closed
- **Then** it is removed from active `notes` and inserted at the front of `closedNotes`
- **And** its `note-{id}.md` and assets remain on disk for restore

## Requirement: Close empty discards

- **id**: notes.close-empty-discards
- **enforced**: true
- **test**: `close_empty_note_is_discarded`
- **Given** an active note with empty/whitespace-only content
- **When** the note is closed
- **Then** it is not added to `closedNotes`
- **And** its markdown document and asset folder are deleted

## Requirement: List delete cleans documents

- **id**: notes.list-delete-cleans
- **enforced**: true
- **entities**: ClosedNote
- **Given** a note appears in the closed-notes list
- **When** the user deletes it from the list
- **Then** it is removed from `closedNotes` and `savedAtMap`
- **And** `note-{id}.md` plus `note-{id}.assets` are removed from disk

## Requirement: Editorial patch updates saved_at

- **id**: notes.editorial-saved-at
- **enforced**: true
- **test**: `editorial_patch_fields_should_touch_saved_at`
- **Given** an active note
- **When** a patch includes content, title, theme, or isPreview
- **Then** `savedAtMap[id]` is updated
- **And** geometry-only patches (position/size/pin) do not need to rewrite sibling markdown files for other notes

## Requirement: Images are external paths only

- **id**: notes.images-external-paths
- **enforced**: true
- **test**: `assets_folder_uses_stable_note_id_stem`, `parse_markdown_image_dest_strips_angle_brackets`
- **Given** a pasted clipboard image
- **When** it is saved
- **Then** bytes are written under `note-{id}.assets/`
- **And** markdown stores a relative path (optionally `<…>` when required by CommonMark)
- **And** the note body must not persist `data:` / base64 image destinations

## Requirement: Asset folder identity is note id

- **id**: notes.assets-note-id
- **enforced**: true
- **test**: `rewrite_content_asset_folders_normalizes_title_assets`
- **Given** historical content referencing `{title}.assets/…`
- **When** state is loaded/normalized
- **Then** image folders are rewritten to `note-{id}.assets/…`

## Requirement: Dual-path preview

- **id**: notes.dual-path
- **enforced**: true
- **entities**: BrowserPreview
- **Given** `npm run dev` without Tauri
- **When** the browser shell runs
- **Then** notes use localStorage only
- **And** desktop Documents persistence and image paste-to-disk are unavailable in that path

## Requirement: Transparent window menus

- **id**: notes.in-window-list-menu
- **enforced**: true
- **Given** a transparent undecorated note window
- **When** the closed-notes list is opened
- **Then** the menu is an in-window absolute panel (no Radix Portal overlay)
- **And** restore is deferred so the menu unmounts before another webview is created
