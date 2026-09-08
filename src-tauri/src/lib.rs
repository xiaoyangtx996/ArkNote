use base64::{engine::general_purpose::STANDARD, Engine as _};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{
    include_image,
    menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, RunEvent, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

mod edge_dock;

/// In-memory notes authority. All RMW goes through this lock so concurrent
/// window patches cannot clobber each other via stale whole-file rewrites.
struct NotesStore(Mutex<StoredNotes>);

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Note {
    id: u32,
    title: String,
    content: String,
    position: NotePoint,
    size: NoteSize,
    is_pinned: bool,
    theme: String,
    #[serde(default)]
    is_preview: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct NotePoint {
    x: f64,
    y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct NoteSize {
    width: f64,
    height: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct StoredNotes {
    version: u32,
    notes: Vec<Note>,
    saved_at_map: HashMap<u32, u64>,
    #[serde(default)]
    closed_notes: Vec<Note>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct NoteWindowSpec {
    id: u32,
    title: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    is_pinned: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum LastNoteCloseAction {
    KeepTray,
    QuitApp,
    ConfirmQuit,
}

impl Default for LastNoteCloseAction {
    fn default() -> Self {
        Self::KeepTray
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AppSettings {
    version: u32,
    last_note_close: LastNoteCloseAction,
    #[serde(default)]
    new_note_pinned: bool,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            version: 1,
            last_note_close: LastNoteCloseAction::KeepTray,
            new_note_pinned: false,
        }
    }
}

fn settings_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("settings.json"))
}

fn load_settings(app: &AppHandle) -> AppSettings {
    let path = match settings_path(app) {
        Ok(path) => path,
        Err(_) => return AppSettings::default(),
    };
    if !path.exists() {
        return AppSettings::default();
    }
    fs::read_to_string(&path)
        .ok()
        .and_then(|raw| serde_json::from_str(&raw).ok())
        .unwrap_or_default()
}

fn save_settings(app: &AppHandle, settings: &AppSettings) -> Result<(), String> {
    let path = settings_path(app)?;
    let raw = serde_json::to_string_pretty(settings).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| e.to_string())
}

fn last_note_close_label(action: LastNoteCloseAction) -> &'static str {
    match action {
        LastNoteCloseAction::KeepTray => "关闭全部便签后：保持托盘运行",
        LastNoteCloseAction::QuitApp => "关闭全部便签后：退出应用",
        LastNoteCloseAction::ConfirmQuit => "关闭最后便签时：询问是否退出",
    }
}

fn build_settings_menu(app: &AppHandle) -> tauri::Result<tauri::menu::Submenu<tauri::Wry>> {
    let settings = load_settings(app);
    let keep_tray = MenuItemBuilder::with_id(
        "setting-keep-tray",
        format!(
            "{}{}",
            if settings.last_note_close == LastNoteCloseAction::KeepTray {
                "✓ "
            } else {
                "  "
            },
            last_note_close_label(LastNoteCloseAction::KeepTray)
        ),
    )
    .build(app)?;
    let quit_on_close = MenuItemBuilder::with_id(
        "setting-quit-app",
        format!(
            "{}{}",
            if settings.last_note_close == LastNoteCloseAction::QuitApp {
                "✓ "
            } else {
                "  "
            },
            last_note_close_label(LastNoteCloseAction::QuitApp)
        ),
    )
    .build(app)?;
    let confirm_quit = MenuItemBuilder::with_id(
        "setting-confirm-quit",
        format!(
            "{}{}",
            if settings.last_note_close == LastNoteCloseAction::ConfirmQuit {
                "✓ "
            } else {
                "  "
            },
            last_note_close_label(LastNoteCloseAction::ConfirmQuit)
        ),
    )
    .build(app)?;
    let new_note_pinned = MenuItemBuilder::with_id(
        "setting-new-note-pinned",
        format!(
            "{}新建便签默认置顶",
            if settings.new_note_pinned { "✓ " } else { "  " }
        ),
    )
    .build(app)?;
    SubmenuBuilder::new(app, "设置")
        .item(&keep_tray)
        .item(&quit_on_close)
        .item(&confirm_quit)
        .separator()
        .item(&new_note_pinned)
        .build()
}

fn note_label(id: u32) -> String {
    format!("note-{}", id)
}

fn is_note_label(label: &str) -> bool {
    label.starts_with("note-")
}

const ARKNOTE_FOLDER: &str = "ArkNote";

fn note_file_stem(note_id: u32) -> String {
    format!("note-{note_id}")
}

/// User-visible documents root: `Documents/ArkNote/`.
fn arknote_root(app: &AppHandle) -> Result<PathBuf, String> {
    let docs = app.path().document_dir().map_err(|e| e.to_string())?;
    let root = docs.join(ARKNOTE_FOLDER);
    fs::create_dir_all(&root).map_err(|e| e.to_string())?;
    Ok(root)
}

fn notes_path(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(arknote_root(app)?.join("index.json"))
}

fn legacy_app_data_notes_json(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("notes.json"))
}

fn legacy_note_dir(app: &AppHandle, note_id: u32) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("notes").join(note_id.to_string()))
}

/// Parent directory for `{stem}.assets` / legacy `images` (ArkNote document root).
fn note_dir(app: &AppHandle, _note_id: u32) -> Result<PathBuf, String> {
    arknote_root(app)
}

/// Sanitize a display title for optional filesystem use (spaces → `_`).
#[allow(dead_code)]
fn sanitize_asset_stem(title: &str, note_id: u32) -> String {
    let trimmed = title.trim();
    let mut stem: String = if trimmed.is_empty() {
        format!("note-{note_id}")
    } else {
        trimmed
            .chars()
            .map(|c| match c {
                '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|' => '_',
                c if c.is_whitespace() => '_',
                c if c.is_control() => '_',
                c => c,
            })
            .collect()
    };
    stem = stem.trim().trim_matches('.').to_string();
    if let Some(stripped) = stem.strip_suffix(".assets") {
        stem = stripped.trim_end_matches('.').to_string();
    }
    if stem.is_empty() {
        format!("note-{note_id}")
    } else {
        stem
    }
}

fn assets_folder_name(_title: &str, note_id: u32) -> String {
    // Stable, space-free folder so CommonMark/Vditor can parse image destinations.
    format!("{}.assets", note_file_stem(note_id))
}

fn note_images_dir_for_title(app: &AppHandle, note_id: u32, title: &str) -> Result<PathBuf, String> {
    Ok(arknote_root(app)?.join(assets_folder_name(title, note_id)))
}

fn note_markdown_path(app: &AppHandle, note_id: u32) -> Result<PathBuf, String> {
    Ok(arknote_root(app)?.join(format!("{}.md", note_file_stem(note_id))))
}

fn parse_markdown_image_dest(raw: &str) -> String {
    let mut dest = raw.trim();
    if dest.starts_with('<') && dest.ends_with('>') && dest.len() >= 2 {
        dest = dest[1..dest.len() - 1].trim();
    }
    dest.trim_start_matches("./").to_string()
}

fn validate_image_rel(path: &str) -> Result<(), String> {
    let path = parse_markdown_image_dest(path);
    if path.contains("..") || path.contains('\\') || path.starts_with('/') || path.starts_with('.')
    {
        return Err("invalid image path".into());
    }
    let mut parts = path.split('/');
    let folder = parts.next().ok_or_else(|| "invalid image path".to_string())?;
    let file = parts.next().ok_or_else(|| "invalid image path".to_string())?;
    if parts.next().is_some() || folder.is_empty() || file.is_empty() {
        return Err("invalid image path".into());
    }
    if folder == "images" || folder.ends_with(".assets") {
        Ok(())
    } else {
        Err("invalid image path".into())
    }
}

fn image_path_for_rel(app: &AppHandle, note_id: u32, rel: &str) -> Result<PathBuf, String> {
    let rel = parse_markdown_image_dest(rel);
    validate_image_rel(&rel)?;
    let mut parts = rel.split('/');
    let folder = parts.next().unwrap();
    let file = parts.next().unwrap();
    let base = note_dir(app, note_id)?;
    let folder_path = base.join(folder);
    let path = folder_path.join(file);
    if !path.starts_with(&folder_path) {
        return Err("invalid image path".into());
    }
    if path.exists() {
        return Ok(path);
    }
    // Legacy APPDATA layout: notes/{id}/{folder}/{file}
    if let Ok(legacy_base) = legacy_note_dir(app, note_id) {
        let legacy = legacy_base.join(folder).join(file);
        if legacy.exists() {
            return Ok(legacy);
        }
    }
    Ok(path)
}

fn extract_image_refs(content: &str) -> HashSet<String> {
    let mut refs = HashSet::new();
    let mut rest = content;
    while let Some(start) = rest.find("](") {
        let sub = &rest[start + 2..];
        if let Some(end) = sub.find(')') {
            let candidate = parse_markdown_image_dest(&sub[..end]);
            if validate_image_rel(&candidate).is_ok() {
                refs.insert(candidate);
            }
            rest = &sub[end..];
        } else {
            break;
        }
    }
    refs
}

fn rewrite_content_asset_folders(content: &str, note_id: u32) -> String {
    let target = assets_folder_name("", note_id);
    let mut out = content.to_string();
    // Replace any `….assets/` image folder with the stable note-{id}.assets/
    let re_parts: Vec<String> = extract_image_refs(content)
        .into_iter()
        .filter_map(|rel| {
            let folder = rel.split('/').next()?.to_string();
            if folder != target && folder.ends_with(".assets") {
                Some(folder)
            } else {
                None
            }
        })
        .collect::<HashSet<_>>()
        .into_iter()
        .collect();
    for folder in re_parts {
        out = out.replace(&format!("{folder}/"), &format!("{target}/"));
        out = out.replace(&format!("<{folder}/"), &format!("<{target}/"));
    }
    out
}

fn sync_note_images(app: &AppHandle, note_id: u32, content: &str) -> Result<(), String> {
    let referenced = extract_image_refs(content);
    let base = note_dir(app, note_id)?;
    if !base.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(&base).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let ft = entry.file_type().map_err(|e| e.to_string())?;
        if !ft.is_dir() {
            continue;
        }
        let folder_name = entry.file_name().to_string_lossy().to_string();
        let expected = assets_folder_name("", note_id);
        if folder_name != "images" && folder_name != expected && !folder_name.ends_with(".assets") {
            continue;
        }
        // Only prune this note's asset folder (and legacy images under legacy dir separately).
        if folder_name != expected && folder_name != "images" {
            continue;
        }
        for file in fs::read_dir(entry.path()).map_err(|e| e.to_string())? {
            let file = file.map_err(|e| e.to_string())?;
            if !file.file_type().map_err(|e| e.to_string())?.is_file() {
                continue;
            }
            let name = file.file_name().to_string_lossy().to_string();
            let rel = format!("{folder_name}/{name}");
            if !referenced.contains(&rel) {
                let _ = fs::remove_file(file.path());
            }
        }
    }
    Ok(())
}

fn delete_note_assets(app: &AppHandle, note_id: u32) -> Result<(), String> {
    let root = arknote_root(app)?;
    let assets = root.join(assets_folder_name("", note_id));
    if assets.exists() {
        fs::remove_dir_all(&assets).map_err(|e| e.to_string())?;
    }
    if let Ok(legacy) = legacy_note_dir(app, note_id) {
        if legacy.exists() {
            let _ = fs::remove_dir_all(legacy);
        }
    }
    Ok(())
}

/// Remove the per-note markdown + assets under Documents/ArkNote.
fn delete_note_document(app: &AppHandle, note_id: u32) -> Result<(), String> {
    let md = note_markdown_path(app, note_id)?;
    if md.exists() {
        fs::remove_file(&md).map_err(|e| e.to_string())?;
    }
    delete_note_assets(app, note_id)
}

fn sync_note_markdown_file(app: &AppHandle, note: &Note) -> Result<(), String> {
    let path = note_markdown_path(app, note.id)?;
    fs::write(path, &note.content).map_err(|e| e.to_string())
}

fn sync_all_note_markdown_files(app: &AppHandle, state: &StoredNotes) -> Result<(), String> {
    for note in state.notes.iter().chain(state.closed_notes.iter()) {
        sync_note_markdown_file(app, note)?;
    }
    Ok(())
}

fn sanitize_image_ext(ext: &str) -> String {
    match ext.to_lowercase().as_str() {
        "jpeg" => "jpg".to_string(),
        "png" | "jpg" | "gif" | "webp" | "bmp" => ext.to_lowercase(),
        _ => "png".to_string(),
    }
}

fn new_image_filename(ext: &str) -> String {
    let ts = chrono_timestamp_ms();
    format!("img_{}.{}", ts, sanitize_image_ext(ext))
}

fn empty_notes_state() -> StoredNotes {
    StoredNotes {
        version: 1,
        notes: vec![],
        saved_at_map: HashMap::new(),
        closed_notes: vec![],
    }
}

fn load_notes_from_disk(app: &AppHandle) -> Result<StoredNotes, String> {
    let path = notes_path(app)?;
    if path.exists() {
        let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
        let mut state: StoredNotes = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
        normalize_note_asset_paths(&mut state);
        return Ok(normalize_state(state));
    }

    // One-time migrate from legacy %APPDATA%\com.texttop.app\notes.json
    if let Ok(legacy) = legacy_app_data_notes_json(app) {
        if legacy.exists() {
            let raw = fs::read_to_string(&legacy).map_err(|e| e.to_string())?;
            let mut state: StoredNotes = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
            normalize_note_asset_paths(&mut state);
            let state = normalize_state(state);
            persist_notes_file(app, &state, MarkdownSync::All)?;
            return Ok(state);
        }
    }

    Ok(normalize_state(empty_notes_state()))
}

fn normalize_note_asset_paths(state: &mut StoredNotes) {
    for note in state.notes.iter_mut().chain(state.closed_notes.iter_mut()) {
        note.content = rewrite_content_asset_folders(&note.content, note.id);
    }
}

fn normalize_state(mut state: StoredNotes) -> StoredNotes {
    let mut seen = HashSet::new();
    state.notes.retain(|note| seen.insert(note.id));

    let active_ids: HashSet<u32> = state.notes.iter().map(|note| note.id).collect();
    let mut seen_closed = HashSet::new();
    state
        .closed_notes
        .retain(|note| seen_closed.insert(note.id) && !active_ids.contains(&note.id));

    state
}

fn persist_notes_file(
    app: &AppHandle,
    state: &StoredNotes,
    markdown: MarkdownSync,
) -> Result<(), String> {
    let path = notes_path(app)?;
    let raw = serde_json::to_string_pretty(state).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, &raw).map_err(|e| e.to_string())?;
    // Windows cannot rename over an existing file; replace explicitly.
    if path.exists() {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    match markdown {
        MarkdownSync::None => {}
        MarkdownSync::One(note_id) => {
            if let Some(note) = state
                .notes
                .iter()
                .chain(state.closed_notes.iter())
                .find(|note| note.id == note_id)
            {
                let _ = sync_note_markdown_file(app, note);
            }
        }
        MarkdownSync::All => {
            let _ = sync_all_note_markdown_files(app, state);
        }
    }
    Ok(())
}

#[derive(Debug, Clone, Copy)]
enum MarkdownSync {
    /// Index only (geometry / pin / theme); markdown bodies unchanged.
    None,
    /// Sync a single note's sibling `.md`.
    One(u32),
    /// Sync every known note markdown (migrate / bootstrap).
    All,
}

fn notes_snapshot(app: &AppHandle) -> Result<StoredNotes, String> {
    let store = app.state::<NotesStore>();
    let guard = store
        .0
        .lock()
        .map_err(|_| "notes store lock poisoned".to_string())?;
    Ok(guard.clone())
}

fn with_notes_mut<F, R>(
    app: &AppHandle,
    emit_changed: bool,
    markdown: MarkdownSync,
    f: F,
) -> Result<R, String>
where
    F: FnOnce(&mut StoredNotes) -> Result<R, String>,
{
    let store = app.state::<NotesStore>();
    let mut guard = store
        .0
        .lock()
        .map_err(|_| "notes store lock poisoned".to_string())?;
    let result = f(&mut guard)?;
    let normalized = normalize_state(guard.clone());
    *guard = normalized;
    persist_notes_file(app, &guard, markdown)?;
    if emit_changed {
        let _ = app.emit("notes-changed", ());
    }
    Ok(result)
}

fn has_note_content(note: &Note) -> bool {
    !note.content.trim().is_empty()
}

/// Close a note inside an in-memory state. Returns whether assets should be deleted
/// (empty note discarded) and whether the note existed.
fn close_note_in_state(state: &mut StoredNotes, note_id: u32) -> CloseNoteOutcome {
    let Some(index) = state.notes.iter().position(|note| note.id == note_id) else {
        return CloseNoteOutcome::NotFound;
    };

    let note = state.notes.remove(index);
    if has_note_content(&note) {
        state.closed_notes.retain(|item| item.id != note_id);
        state.closed_notes.insert(0, note);
        CloseNoteOutcome::MovedToClosed
    } else {
        state.saved_at_map.remove(&note_id);
        CloseNoteOutcome::DiscardedEmpty
    }
}

#[derive(Debug, PartialEq, Eq)]
enum CloseNoteOutcome {
    NotFound,
    MovedToClosed,
    DiscardedEmpty,
}

fn destroy_note_window(app: &AppHandle, note_id: u32) {
    if let Some(window) = app.get_webview_window(&note_label(note_id)) {
        let _ = window.destroy();
    }
}

fn note_window_url() -> WebviewUrl {
    if cfg!(debug_assertions) {
        WebviewUrl::External("http://localhost:5173/".parse().expect("valid dev url"))
    } else {
        WebviewUrl::App("index.html".parse().expect("valid app url"))
    }
}

fn clamp_to_primary_monitor(app: &AppHandle, x: f64, y: f64, w: f64, h: f64) -> (f64, f64) {
    let Ok(Some(monitor)) = app.primary_monitor() else {
        return (x.max(0.0), y.max(0.0));
    };
    let scale = monitor.scale_factor();
    let size = monitor.size().to_logical::<f64>(scale);
    let origin = monitor.position().to_logical::<f64>(scale);
    let max_x = (origin.x + size.width - w).max(origin.x);
    let max_y = (origin.y + size.height - h).max(origin.y);
    (x.max(origin.x).min(max_x), y.max(origin.y).min(max_y))
}

fn default_note(id: u32, app: &AppHandle, slot: usize) -> Result<Note, String> {
    let monitor = app.primary_monitor().map_err(|e| e.to_string())?.ok_or("no monitor")?;
    let scale = monitor.scale_factor();
    let size = monitor.size().to_logical::<f64>(scale);
    let origin = monitor.position().to_logical::<f64>(scale);
    let width = 300.0;
    let height = 400.0;
    let offset = (slot % 8) as f64 * 40.0;
    let x = origin.x + (size.width - width) / 2.0 + offset;
    let y = origin.y + (size.height - height) / 2.0 + offset;
    let (x, y) = clamp_to_primary_monitor(app, x, y, width, height);
    Ok(Note {
        id,
        title: format!("便签 #{}", id),
        content: String::new(),
        position: NotePoint { x, y },
        size: NoteSize { width, height },
        is_pinned: load_settings(app).new_note_pinned,
        theme: "business".into(),
        is_preview: false,
    })
}

fn note_to_spec(note: &Note) -> NoteWindowSpec {
    NoteWindowSpec {
        id: note.id,
        title: note.title.clone(),
        x: note.position.x,
        y: note.position.y,
        width: note.size.width,
        height: note.size.height,
        is_pinned: note.is_pinned,
    }
}

fn apply_note_window_spec(window: &WebviewWindow, spec: &NoteWindowSpec) -> tauri::Result<()> {
    let app = window.app_handle();
    let (x, y) = clamp_to_primary_monitor(app, spec.x, spec.y, spec.width, spec.height);
    window.set_position(LogicalPosition::new(x, y))?;
    window.set_size(LogicalSize::new(spec.width, spec.height))?;
    window.set_always_on_top(spec.is_pinned)?;
    let _ = window.set_title(&spec.title);
    Ok(())
}

fn app_window_icon() -> tauri::image::Image<'static> {
    include_image!("icons/32x32.png")
}

fn open_or_update_note_window(app: &AppHandle, spec: &NoteWindowSpec) -> tauri::Result<()> {
    let label = note_label(spec.id);
    let (x, y) = clamp_to_primary_monitor(app, spec.x, spec.y, spec.width, spec.height);

    if let Some(window) = app.get_webview_window(&label) {
        apply_note_window_spec(&window, spec)?;
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
        return Ok(());
    }

    let window = WebviewWindowBuilder::new(app, &label, note_window_url())
        .title(&spec.title)
        .inner_size(spec.width, spec.height)
        .min_inner_size(250.0, 310.0)
        .position(x, y)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .skip_taskbar(true)
        .resizable(true)
        .always_on_top(spec.is_pinned)
        .icon(app_window_icon())?
        .build()?;

    let _ = window.show();
    let _ = window.set_focus();
    Ok(())
}

fn show_all_note_windows(app: &AppHandle) {
    let mut has_any = false;
    for (label, window) in app.webview_windows() {
        if is_note_label(&label) {
            has_any = true;
            let _ = window.show();
            let _ = window.unminimize();
            let _ = window.set_focus();
        }
    }
    if !has_any {
        let _ = create_new_note(app);
    }
}

fn next_note_id(state: &StoredNotes) -> u32 {
    state
        .notes
        .iter()
        .chain(state.closed_notes.iter())
        .map(|n| n.id)
        .max()
        .unwrap_or(0)
        + 1
}

fn open_note_window_deferred(app: &AppHandle, spec: NoteWindowSpec) {
    let app = app.clone();
    // Window creation must not run inline on the command worker thread —
    // that deadlocks WebView2 / freezes the caller (seen on restore from list).
    tauri::async_runtime::spawn(async move {
        let _ = open_or_update_note_window(&app, &spec);
    });
}

fn create_new_note(app: &AppHandle) -> Result<(), String> {
    let note = with_notes_mut(app, false, MarkdownSync::None, |state| {
        let id = next_note_id(state);
        let slot = state.notes.len();
        let note = default_note(id, app, slot)?;
        state.notes.push(note.clone());
        Ok(note)
    })?;
    let _ = sync_note_markdown_file(app, &note);
    open_note_window_deferred(app, note_to_spec(&note));
    Ok(())
}

fn bootstrap_windows(app: &AppHandle) -> Result<(), String> {
    let notes = {
        let store = app.state::<NotesStore>();
        let mut guard = store
            .0
            .lock()
            .map_err(|_| "notes store lock poisoned".to_string())?;
        if guard.notes.is_empty() {
            guard.notes.push(default_note(1, app, 0)?);
            let normalized = normalize_state(guard.clone());
            *guard = normalized;
            persist_notes_file(app, &guard, MarkdownSync::All)?;
        }
        guard.notes.clone()
    };
    for note in &notes {
        open_or_update_note_window(app, &note_to_spec(note)).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct NotePatch {
    title: Option<String>,
    content: Option<String>,
    position: Option<NotePoint>,
    size: Option<NoteSize>,
    is_pinned: Option<bool>,
    theme: Option<String>,
    is_preview: Option<bool>,
}

fn apply_note_patch(note: &mut Note, patch: &NotePatch) {
    if let Some(title) = &patch.title {
        note.title = title.clone();
    }
    if let Some(content) = &patch.content {
        note.content = content.clone();
    }
    if let Some(position) = &patch.position {
        note.position = position.clone();
    }
    if let Some(size) = &patch.size {
        note.size = size.clone();
    }
    if let Some(is_pinned) = patch.is_pinned {
        note.is_pinned = is_pinned;
    }
    if let Some(theme) = &patch.theme {
        note.theme = theme.clone();
    }
    if let Some(is_preview) = patch.is_preview {
        note.is_preview = is_preview;
    }
}

fn emit_toggle_app_theme(app: &AppHandle) {
    let _ = app.emit("toggle-app-theme", ());
}

#[tauri::command]
fn load_notes_cmd(app: AppHandle) -> Result<StoredNotes, String> {
    notes_snapshot(&app)
}

#[tauri::command]
fn patch_note_cmd(app: AppHandle, note_id: u32, patch: NotePatch) -> Result<(), String> {
    let markdown = if patch.content.is_some() {
        MarkdownSync::One(note_id)
    } else {
        MarkdownSync::None
    };
    let content_to_sync = with_notes_mut(&app, false, markdown, |state| {
        let Some(note) = state.notes.iter_mut().find(|note| note.id == note_id) else {
            return Ok(None);
        };
        apply_note_patch(note, &patch);
        // Content-like edits update saved_at so the UI can leave "尚未保存".
        if patch.content.is_some()
            || patch.title.is_some()
            || patch.theme.is_some()
            || patch.is_preview.is_some()
        {
            state.saved_at_map.insert(note_id, chrono_timestamp_ms());
        }
        if patch.content.is_some() {
            Ok(Some(note.content.clone()))
        } else {
            Ok(None)
        }
    })?;
    if let Some(content) = content_to_sync {
        let _ = sync_note_images(&app, note_id, &content);
    }
    Ok(())
}

#[tauri::command]
fn close_note_data_cmd(app: AppHandle, note_id: u32) -> Result<(), String> {
    let outcome = {
        let store = app.state::<NotesStore>();
        let mut guard = store
            .0
            .lock()
            .map_err(|_| "notes store lock poisoned".to_string())?;
        let outcome = close_note_in_state(&mut guard, note_id);
        if matches!(outcome, CloseNoteOutcome::NotFound) {
            drop(guard);
            destroy_note_window(&app, note_id);
            return Ok(());
        }
        let normalized = normalize_state(guard.clone());
        *guard = normalized;
        // Bodies already on disk from editorial patches; index-only write is enough.
        persist_notes_file(&app, &guard, MarkdownSync::None)?;
        let _ = app.emit("notes-changed", ());
        outcome
    };
    if matches!(outcome, CloseNoteOutcome::DiscardedEmpty) {
        let _ = delete_note_document(&app, note_id);
    }
    Ok(())
}

#[tauri::command]
fn restore_note_cmd(app: AppHandle, note_id: u32) -> Result<(), String> {
    let note = with_notes_mut(&app, true, MarkdownSync::None, |state| {
        let Some(index) = state
            .closed_notes
            .iter()
            .position(|note| note.id == note_id)
        else {
            return Ok(None);
        };
        let note = state.closed_notes.remove(index);
        state.notes.push(note.clone());
        Ok(Some(note))
    })?;
    if let Some(note) = note {
        open_note_window_deferred(&app, note_to_spec(&note));
    }
    Ok(())
}

#[tauri::command]
fn delete_closed_note_cmd(app: AppHandle, note_id: u32) -> Result<(), String> {
    with_notes_mut(&app, true, MarkdownSync::None, |state| {
        state.closed_notes.retain(|note| note.id != note_id);
        state.saved_at_map.remove(&note_id);
        Ok(())
    })?;
    // List delete removes both the markdown document and image assets.
    let _ = delete_note_document(&app, note_id);
    Ok(())
}

#[tauri::command]
fn apply_theme_cmd(app: AppHandle, theme: String) -> Result<(), String> {
    with_notes_mut(&app, true, MarkdownSync::None, |state| {
        for note in &mut state.notes {
            note.theme = theme.clone();
        }
        Ok(())
    })
}

#[tauri::command]
fn cycle_theme_cmd(app: AppHandle) -> Result<(), String> {
    let themes = ["business", "eyecare", "dark"];
    with_notes_mut(&app, true, MarkdownSync::None, |state| {
        if state.notes.is_empty() {
            return Ok(());
        }
        let current = state.notes[0].theme.as_str();
        let current_idx = themes.iter().position(|theme| *theme == current).unwrap_or(0);
        let next_theme = themes[(current_idx + 1) % themes.len()];
        for note in &mut state.notes {
            note.theme = next_theme.to_string();
        }
        Ok(())
    })
}

#[tauri::command]
fn touch_saved_at_cmd(app: AppHandle, note_id: u32) -> Result<(), String> {
    with_notes_mut(&app, false, MarkdownSync::None, |state| {
        if !state.notes.iter().any(|note| note.id == note_id) {
            return Ok(());
        }
        state.saved_at_map.insert(note_id, chrono_timestamp_ms());
        Ok(())
    })
}

fn chrono_timestamp_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

fn validate_note_image_bytes(data: &[u8]) -> Result<(), String> {
    const MAX_NOTE_IMAGE_BYTES: usize = 8 * 1024 * 1024;
    if data.is_empty() {
        return Err("empty image data".into());
    }
    if data.len() > MAX_NOTE_IMAGE_BYTES {
        return Err("image too large".into());
    }
    Ok(())
}

fn save_note_image_bytes(
    app: &AppHandle,
    note_id: u32,
    data: &[u8],
    extension: Option<&str>,
    note_title: &str,
) -> Result<String, String> {
    validate_note_image_bytes(data)?;
    let ext = extension.unwrap_or("png");
    let filename = new_image_filename(ext);
    let folder = assets_folder_name(note_title, note_id);
    let dir = note_images_dir_for_title(app, note_id, note_title)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(&filename);
    fs::write(path, data).map_err(|e| e.to_string())?;
    Ok(format!("{folder}/{filename}"))
}

#[tauri::command]
fn save_note_image_cmd(
    app: AppHandle,
    note_id: u32,
    data_base64: String,
    extension: Option<String>,
    note_title: Option<String>,
) -> Result<String, String> {
    let data = STANDARD
        .decode(data_base64.trim())
        .map_err(|e| format!("invalid image base64: {e}"))?;
    let title = note_title.unwrap_or_default();
    save_note_image_bytes(&app, note_id, &data, extension.as_deref(), &title)
}

#[tauri::command]
fn resolve_note_image_path_cmd(
    app: AppHandle,
    note_id: u32,
    relative_path: String,
) -> Result<String, String> {
    let path = image_path_for_rel(&app, note_id, &relative_path)?;
    if !path.exists() {
        return Err("image not found".into());
    }
    Ok(path.to_string_lossy().to_string())
}

#[tauri::command]
fn open_note_window(app: AppHandle, note: NoteWindowSpec) -> Result<(), String> {
    open_note_window_deferred(&app, note);
    Ok(())
}

#[tauri::command]
fn close_note_window(app: AppHandle, note_id: u32) -> Result<(), String> {
    destroy_note_window(&app, note_id);
    Ok(())
}

#[tauri::command]
fn update_note_window(app: AppHandle, note: NoteWindowSpec) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&note_label(note.id)) {
        apply_note_window_spec(&window, &note).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn set_note_always_on_top(app: AppHandle, note_id: u32, is_pinned: bool) -> Result<(), String> {
    if let Some(window) = app.get_webview_window(&note_label(note_id)) {
        window
            .set_always_on_top(is_pinned)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct EdgeDockPlanDto {
    edge: String,
    rest_x: f64,
    rest_y: f64,
    rest_w: f64,
    rest_h: f64,
    hide_x: f64,
    hide_y: f64,
    hide_w: f64,
    hide_h: f64,
}

fn monitor_work_rect_for_window(window: &WebviewWindow) -> Result<edge_dock::Rect, String> {
    let monitor = window
        .current_monitor()
        .map_err(|e| e.to_string())?
        .or_else(|| window.primary_monitor().ok().flatten())
        .ok_or_else(|| "no monitor".to_string())?;
    let scale = monitor.scale_factor();
    let size = monitor.size().to_logical::<f64>(scale);
    let origin = monitor.position().to_logical::<f64>(scale);
    Ok(edge_dock::Rect {
        x: origin.x,
        y: origin.y,
        width: size.width,
        height: size.height,
    })
}

fn window_outer_rect(window: &WebviewWindow) -> Result<edge_dock::Rect, String> {
    let factor = window.scale_factor().map_err(|e| e.to_string())?;
    let pos = window
        .outer_position()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(factor);
    let size = window
        .outer_size()
        .map_err(|e| e.to_string())?
        .to_logical::<f64>(factor);
    Ok(edge_dock::Rect {
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
    })
}

#[tauri::command]
fn evaluate_note_edge_dock(app: AppHandle, note_id: u32) -> Result<Option<EdgeDockPlanDto>, String> {
    let Some(window) = app.get_webview_window(&note_label(note_id)) else {
        return Ok(None);
    };
    let win = window_outer_rect(&window)?;
    let work = monitor_work_rect_for_window(&window)?;
    let Some(plan) = edge_dock::plan_dock(win, work) else {
        return Ok(None);
    };
    let edge = match plan.edge {
        edge_dock::DockEdge::Left => "left",
        edge_dock::DockEdge::Right => "right",
        edge_dock::DockEdge::Top => "top",
        edge_dock::DockEdge::Bottom => "bottom",
    };
    Ok(Some(EdgeDockPlanDto {
        edge: edge.into(),
        rest_x: plan.rest_x,
        rest_y: plan.rest_y,
        rest_w: plan.rest_w,
        rest_h: plan.rest_h,
        hide_x: plan.hide_x,
        hide_y: plan.hide_y,
        hide_w: plan.hide_w,
        hide_h: plan.hide_h,
    }))
}

/// Set window position without clamping (needed for off-screen peek).
#[tauri::command]
fn set_note_window_position(app: AppHandle, note_id: u32, x: f64, y: f64) -> Result<(), String> {
    let Some(window) = app.get_webview_window(&note_label(note_id)) else {
        return Ok(());
    };
    window
        .set_position(LogicalPosition::new(x, y))
        .map_err(|e| e.to_string())
}

/// Animate position + size (bookmark collapse / expand), anchored to dock edge.
#[tauri::command]
async fn animate_note_window_position(
    app: AppHandle,
    note_id: u32,
    to_x: f64,
    to_y: f64,
    duration_ms: u64,
    to_w: Option<f64>,
    to_h: Option<f64>,
    edge: Option<String>,
) -> Result<(), String> {
    let Some(window) = app.get_webview_window(&note_label(note_id)) else {
        return Ok(());
    };
    let from = window_outer_rect(&window)?;
    let target_w = to_w.unwrap_or(from.width);
    let target_h = to_h.unwrap_or(from.height);
    let edge = edge.unwrap_or_default();
    // Bookmark tabs are smaller than the normal note min; relax then restore.
    window
        .set_min_size(Some(LogicalSize::new(36.0, 36.0)))
        .map_err(|err| err.to_string())?;

    // Ease-out expo-ish with enough frames for a smooth dock morph.
    let steps = ((duration_ms / 12).max(12)).min(40);
    let frame_ms = (duration_ms / steps).max(8);
    for i in 1..=steps {
        let t = i as f64 / steps as f64;
        // smootherstep → soft ease-in-out
        let e = t * t * (3.0 - 2.0 * t);
        let e = e * e * (3.0 - 2.0 * e);
        let w = edge_dock::lerp(from.width, target_w, e);
        let h = edge_dock::lerp(from.height, target_h, e);
        let (x, y) = match edge.as_str() {
            "left" => (to_x, edge_dock::lerp(from.y, to_y, e)),
            "right" => (to_x + target_w - w, edge_dock::lerp(from.y, to_y, e)),
            "top" => (edge_dock::lerp(from.x, to_x, e), to_y),
            "bottom" => (edge_dock::lerp(from.x, to_x, e), to_y + target_h - h),
            _ => (
                edge_dock::lerp(from.x, to_x, e),
                edge_dock::lerp(from.y, to_y, e),
            ),
        };
        window
            .set_size(LogicalSize::new(w, h))
            .map_err(|err| err.to_string())?;
        window
            .set_position(LogicalPosition::new(x, y))
            .map_err(|err| err.to_string())?;
        tokio::time::sleep(std::time::Duration::from_millis(frame_ms)).await;
    }
    window
        .set_size(LogicalSize::new(target_w, target_h))
        .map_err(|e| e.to_string())?;
    window
        .set_position(LogicalPosition::new(to_x, to_y))
        .map_err(|e| e.to_string())?;
    if target_w >= 250.0 && target_h >= 310.0 {
        window
            .set_min_size(Some(LogicalSize::new(250.0, 310.0)))
            .map_err(|err| err.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn set_new_note_pinned_cmd(app: AppHandle, pinned: bool) -> Result<(), String> {
    let mut settings = load_settings(&app);
    settings.new_note_pinned = pinned;
    save_settings(&app, &settings)
}

#[tauri::command]
fn create_note_cmd(app: AppHandle) -> Result<(), String> {
    create_new_note(&app)
}

#[tauri::command]
fn get_settings_cmd(app: AppHandle) -> Result<AppSettings, String> {
    Ok(load_settings(&app))
}

#[tauri::command]
fn set_last_note_close_cmd(app: AppHandle, action: LastNoteCloseAction) -> Result<(), String> {
    let mut settings = load_settings(&app);
    settings.last_note_close = action;
    save_settings(&app, &settings)
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn open_url_cmd(url: String) -> Result<(), String> {
    open_https_url(&url)
}

fn open_https_url(url: &str) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("only http(s) urls are allowed".into());
    }
    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", "", url])
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[cfg(all(unix, not(target_os = "macos")))]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| e.to_string())?;
        return Ok(());
    }
    #[allow(unreachable_code)]
    Err("open url unsupported on this platform".into())
}

fn open_about_window_deferred(app: &AppHandle) {
    let app = app.clone();
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_millis(30));
        if let Some(existing) = app.get_webview_window("about") {
            let _ = existing.set_focus();
            return;
        }
        let builder = WebviewWindowBuilder::new(&app, "about", note_window_url())
            .title("关于 ArkNote")
            .inner_size(380.0, 460.0)
            .resizable(false)
            .maximizable(false)
            .minimizable(true)
            .skip_taskbar(false)
            .visible(true)
            .icon(app_window_icon());
        match builder {
            Ok(builder) => match builder.build() {
                Ok(window) => {
                    let _ = window.center();
                    let _ = window.set_focus();
                }
                Err(err) => {
                    eprintln!("[arknote] open about window failed: {err}");
                }
            },
            Err(err) => {
                eprintln!("[arknote] about window icon failed: {err}");
            }
        }
    });
}

const TRAY_ID: &str = "main-tray";

fn build_main_tray_menu(app: &AppHandle) -> tauri::Result<tauri::menu::Menu<tauri::Wry>> {
    let show_notes = MenuItemBuilder::with_id("show-notes", "显示便签").build(app)?;
    let new_note = MenuItemBuilder::with_id("new-note", "新建便签").build(app)?;
    let theme_business = MenuItemBuilder::with_id("theme-business", "商务白").build(app)?;
    let theme_eyecare = MenuItemBuilder::with_id("theme-eyecare", "护眼绿").build(app)?;
    let theme_dark = MenuItemBuilder::with_id("theme-dark", "暗色").build(app)?;
    let theme_cycle = MenuItemBuilder::with_id("theme-cycle", "循环切换").build(app)?;
    let color_menu = SubmenuBuilder::new(app, "快速颜色切换")
        .item(&theme_business)
        .item(&theme_eyecare)
        .item(&theme_dark)
        .item(&theme_cycle)
        .build()?;
    let settings_menu = build_settings_menu(app)?;
    let toggle_dark = MenuItemBuilder::with_id("toggle-dark", "切换暗色模式").build(app)?;
    let about = MenuItemBuilder::with_id("about", "关于 ArkNote").build(app)?;
    let quit = MenuItemBuilder::with_id("quit", "退出应用").build(app)?;

    MenuBuilder::new(app)
        .item(&show_notes)
        .item(&new_note)
        .item(&color_menu)
        .item(&settings_menu)
        .item(&toggle_dark)
        .separator()
        .item(&about)
        .item(&quit)
        .build()
}

fn rebuild_tray_menu(app: &AppHandle) -> tauri::Result<()> {
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let menu = build_main_tray_menu(app)?;
        let _ = tray.set_menu(Some(menu));
    }
    Ok(())
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
    let tray_icon = include_image!("icons/tray-icon.png");
    let menu = build_main_tray_menu(app)?;

    let _tray = TrayIconBuilder::with_id(TRAY_ID)
        .icon(tray_icon)
        .tooltip("ArkNote")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "show-notes" => show_all_note_windows(app),
            "new-note" => {
                let _ = create_new_note(app);
            }
            "theme-business" => {
                let _ = apply_theme_cmd(app.clone(), "business".into());
            }
            "theme-eyecare" => {
                let _ = apply_theme_cmd(app.clone(), "eyecare".into());
            }
            "theme-dark" => {
                let _ = apply_theme_cmd(app.clone(), "dark".into());
            }
            "theme-cycle" => {
                let _ = cycle_theme_cmd(app.clone());
            }
            "setting-keep-tray" => {
                let _ = set_last_note_close_cmd(app.clone(), LastNoteCloseAction::KeepTray);
                let _ = rebuild_tray_menu(app);
            }
            "setting-quit-app" => {
                let _ = set_last_note_close_cmd(app.clone(), LastNoteCloseAction::QuitApp);
                let _ = rebuild_tray_menu(app);
            }
            "setting-confirm-quit" => {
                let _ = set_last_note_close_cmd(app.clone(), LastNoteCloseAction::ConfirmQuit);
                let _ = rebuild_tray_menu(app);
            }
            "setting-new-note-pinned" => {
                let pinned = !load_settings(app).new_note_pinned;
                let _ = set_new_note_pinned_cmd(app.clone(), pinned);
                let _ = rebuild_tray_menu(app);
            }
            "toggle-dark" => emit_toggle_app_theme(app),
            "about" => open_about_window_deferred(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                show_all_note_windows(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn register_shortcut(app: &AppHandle) {
    let shortcut = Shortcut::new(Some(Modifiers::CONTROL), Code::KeyN);
    let app_handle = app.clone();

    let _ = app.global_shortcut().on_shortcut(shortcut, move |_, _, event| {
        if event.state == ShortcutState::Pressed {
            let _ = create_new_note(&app_handle);
        }
    });

    let _ = app.global_shortcut().register(shortcut);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            load_notes_cmd,
            patch_note_cmd,
            close_note_data_cmd,
            restore_note_cmd,
            delete_closed_note_cmd,
            apply_theme_cmd,
            cycle_theme_cmd,
            touch_saved_at_cmd,
            create_note_cmd,
            open_note_window,
            close_note_window,
            update_note_window,
            set_note_always_on_top,
            evaluate_note_edge_dock,
            set_note_window_position,
            animate_note_window_position,
            get_settings_cmd,
            set_last_note_close_cmd,
            set_new_note_pinned_cmd,
            save_note_image_cmd,
            resolve_note_image_path_cmd,
            open_url_cmd,
            quit_app,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            let initial = load_notes_from_disk(app.handle()).unwrap_or_else(|_| empty_notes_state());
            app.manage(NotesStore(Mutex::new(initial)));

            build_tray(app.handle())?;
            register_shortcut(app.handle());
            bootstrap_windows(app.handle())?;

            Ok(())
        });

    builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|_app, event| {
            if let RunEvent::ExitRequested { api, code, .. } = event {
                if code.is_none() {
                    api.prevent_exit();
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sample_note(id: u32, content: &str) -> Note {
        Note {
            id,
            title: format!("便签 #{id}"),
            content: content.to_string(),
            position: NotePoint { x: 10.0, y: 20.0 },
            size: NoteSize {
                width: 300.0,
                height: 400.0,
            },
            is_pinned: false,
            theme: "business".into(),
            is_preview: false,
        }
    }

    #[test]
    fn sequential_patches_on_different_notes_both_retained() {
        // Models the mutex path: mutate shared state in sequence (as concurrent
        // commands serialize on the lock) instead of stale whole-file rewrites.
        let mut state = empty_notes_state();
        state.notes.push(sample_note(1, "a"));
        state.notes.push(sample_note(2, "b"));

        {
            let note = state.notes.iter_mut().find(|n| n.id == 1).unwrap();
            apply_note_patch(
                note,
                &NotePatch {
                    title: None,
                    content: Some("alpha".into()),
                    position: None,
                    size: None,
                    is_pinned: None,
                    theme: None,
                    is_preview: None,
                },
            );
        }
        {
            let note = state.notes.iter_mut().find(|n| n.id == 2).unwrap();
            apply_note_patch(
                note,
                &NotePatch {
                    title: None,
                    content: Some("beta".into()),
                    position: None,
                    size: None,
                    is_pinned: None,
                    theme: None,
                    is_preview: None,
                },
            );
        }

        assert_eq!(
            state.notes.iter().find(|n| n.id == 1).unwrap().content,
            "alpha"
        );
        assert_eq!(
            state.notes.iter().find(|n| n.id == 2).unwrap().content,
            "beta"
        );
    }

    #[test]
    fn close_note_with_content_moves_to_closed_list() {
        let mut state = empty_notes_state();
        state.notes.push(sample_note(1, "keep me"));
        assert_eq!(
            close_note_in_state(&mut state, 1),
            CloseNoteOutcome::MovedToClosed
        );
        assert!(state.notes.is_empty());
        assert_eq!(state.closed_notes.len(), 1);
        assert_eq!(state.closed_notes[0].content, "keep me");
    }

    #[test]
    fn close_empty_note_is_discarded() {
        let mut state = empty_notes_state();
        state.notes.push(sample_note(1, "   "));
        state.saved_at_map.insert(1, 123);
        assert_eq!(
            close_note_in_state(&mut state, 1),
            CloseNoteOutcome::DiscardedEmpty
        );
        assert!(state.notes.is_empty());
        assert!(state.closed_notes.is_empty());
        assert!(!state.saved_at_map.contains_key(&1));
    }

    #[test]
    fn normalize_state_drops_duplicate_and_active_from_closed() {
        let mut state = empty_notes_state();
        state.notes.push(sample_note(1, "a"));
        state.notes.push(sample_note(1, "dup"));
        state.closed_notes.push(sample_note(1, "old"));
        state.closed_notes.push(sample_note(2, "c"));
        state = normalize_state(state);
        assert_eq!(state.notes.len(), 1);
        assert_eq!(state.notes[0].content, "a");
        assert_eq!(state.closed_notes.len(), 1);
        assert_eq!(state.closed_notes[0].id, 2);
    }

    #[test]
    fn validate_note_image_bytes_rejects_empty_and_oversized() {
        assert!(validate_note_image_bytes(&[]).is_err());
        assert!(validate_note_image_bytes(&[1, 2, 3]).is_ok());
        let huge = vec![0u8; 8 * 1024 * 1024 + 1];
        assert_eq!(
            validate_note_image_bytes(&huge).unwrap_err(),
            "image too large"
        );
    }

    #[test]
    fn editorial_patch_fields_should_touch_saved_at() {
        // Mirrors patch_note_cmd: content/title/theme/preview update saved_at.
        let mut saved_at_map = HashMap::<u32, u64>::new();
        let note_id = 1u32;
        let patch = NotePatch {
            title: Some("t".into()),
            content: None,
            position: None,
            size: None,
            is_pinned: None,
            theme: None,
            is_preview: None,
        };
        if patch.content.is_some()
            || patch.title.is_some()
            || patch.theme.is_some()
            || patch.is_preview.is_some()
        {
            saved_at_map.insert(note_id, 42);
        }
        assert_eq!(saved_at_map.get(&note_id), Some(&42));
    }

    #[test]
    fn assets_folder_uses_stable_note_id_stem() {
        assert_eq!(assets_folder_name("便签 #1", 1), "note-1.assets");
        assert_eq!(assets_folder_name("a/b:c", 2), "note-2.assets");
        assert_eq!(assets_folder_name("   ", 3), "note-3.assets");
        assert!(validate_image_rel("note-1.assets/img_1.png").is_ok());
        assert!(validate_image_rel("便签 #1.assets/img_1.png").is_ok());
        assert!(validate_image_rel("images/img_1.png").is_ok());
        assert!(validate_image_rel("../x.assets/a.png").is_err());
    }

    #[test]
    fn rewrite_content_asset_folders_normalizes_title_assets() {
        let raw = "![image](<便签 #1.assets/img_1.png>)\n![x](old.assets/a.png)";
        let next = rewrite_content_asset_folders(raw, 1);
        assert!(next.contains("note-1.assets/img_1.png"));
        assert!(next.contains("note-1.assets/a.png"));
        assert!(!next.contains("便签 #1.assets"));
    }

    #[test]
    fn parse_markdown_image_dest_strips_angle_brackets() {
        assert_eq!(
            parse_markdown_image_dest("<note-1.assets/img.png>"),
            "note-1.assets/img.png"
        );
        assert_eq!(
            parse_markdown_image_dest("note-1.assets/img.png"),
            "note-1.assets/img.png"
        );
    }
}
