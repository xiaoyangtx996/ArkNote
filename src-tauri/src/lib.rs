use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use base64::{engine::general_purpose::STANDARD, Engine as _};
use tauri::{
    include_image,
    menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, RunEvent, WebviewUrl, WebviewWindow,
    WebviewWindowBuilder,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

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
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            version: 1,
            last_note_close: LastNoteCloseAction::KeepTray,
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
    SubmenuBuilder::new(app, "设置")
        .item(&keep_tray)
        .item(&quit_on_close)
        .item(&confirm_quit)
        .build()
}

fn note_label(id: u32) -> String {
    format!("note-{}", id)
}

fn is_note_label(label: &str) -> bool {
    label.starts_with("note-")
}

fn notes_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join("notes.json"))
}

fn note_dir(app: &AppHandle, note_id: u32) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    Ok(dir.join("notes").join(note_id.to_string()))
}

fn note_images_dir(app: &AppHandle, note_id: u32) -> Result<PathBuf, String> {
    Ok(note_dir(app, note_id)?.join("images"))
}

fn validate_image_rel(path: &str) -> Result<(), String> {
    if !path.starts_with("images/") || path.contains("..") || path.contains('\\') {
        return Err("invalid image path".into());
    }
    Ok(())
}

fn image_path_for_rel(app: &AppHandle, note_id: u32, rel: &str) -> Result<PathBuf, String> {
    validate_image_rel(rel)?;
    let base = note_dir(app, note_id)?;
    let path = base.join(rel);
    let images_dir = base.join("images");
    if !path.starts_with(&images_dir) {
        return Err("invalid image path".into());
    }
    Ok(path)
}

fn extract_image_refs(content: &str) -> HashSet<String> {
    let mut refs = HashSet::new();
    let mut rest = content;
    while let Some(idx) = rest.find("](images/") {
        let sub = &rest[idx + 2..];
        if let Some(end) = sub.find(')') {
            refs.insert(sub[..end].to_string());
            rest = &sub[end..];
        } else {
            break;
        }
    }
    refs
}

fn sync_note_images(app: &AppHandle, note_id: u32, content: &str) -> Result<(), String> {
    let referenced = extract_image_refs(content);
    let dir = note_images_dir(app, note_id)?;
    if !dir.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(&dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        if !entry.file_type().map_err(|e| e.to_string())?.is_file() {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let rel = format!("images/{}", name);
        if !referenced.contains(&rel) {
            let _ = fs::remove_file(entry.path());
        }
    }
    Ok(())
}

fn delete_note_assets(app: &AppHandle, note_id: u32) -> Result<(), String> {
    let dir = note_dir(app, note_id)?;
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
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

fn image_mime_for_path(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|ext| ext.to_str())
        .map(|ext| ext.to_lowercase())
        .as_deref()
    {
        Some("jpg") | Some("jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("bmp") => "image/bmp",
        _ => "image/png",
    }
}

fn new_image_filename(ext: &str) -> String {
    let ts = chrono_timestamp_ms();
    format!("img_{}.{}", ts, sanitize_image_ext(ext))
}

fn read_note_image_data_url(
    app: &AppHandle,
    note_id: u32,
    relative_path: &str,
) -> Result<String, String> {
    let path = image_path_for_rel(app, note_id, relative_path)?;
    if !path.exists() {
        return Err(format!("image not found: {relative_path}"));
    }
    let data = fs::read(&path).map_err(|e| e.to_string())?;
    let mime = image_mime_for_path(&path);
    let encoded = STANDARD.encode(data);
    Ok(format!("data:{mime};base64,{encoded}"))
}

fn load_notes(app: &AppHandle) -> Result<StoredNotes, String> {
    let path = notes_path(app)?;
    if !path.exists() {
        return Ok(normalize_state(StoredNotes {
            version: 1,
            notes: vec![],
            saved_at_map: HashMap::new(),
            closed_notes: vec![],
        }));
    }
    let raw = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let state: StoredNotes = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    Ok(normalize_state(state))
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

fn save_notes(app: &AppHandle, state: &StoredNotes, emit_changed: bool) -> Result<(), String> {
    let path = notes_path(app)?;
    let normalized = normalize_state(state.clone());
    let raw = serde_json::to_string_pretty(&normalized).map_err(|e| e.to_string())?;
    fs::write(path, raw).map_err(|e| e.to_string())?;
    if emit_changed {
        let _ = app.emit("notes-changed", ());
    }
    Ok(())
}

fn has_note_content(note: &Note) -> bool {
    !note.content.trim().is_empty()
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
        is_pinned: false,
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
        .position(x, y)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .skip_taskbar(true)
        .resizable(false)
        .always_on_top(spec.is_pinned)
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

fn create_new_note(app: &AppHandle) -> Result<(), String> {
    let mut state = load_notes(app)?;
    let id = next_note_id(&state);
    let slot = state.notes.len();
    let note = default_note(id, app, slot)?;
    state.notes.push(note.clone());
    save_notes(app, &state, false)?;
    let spec = note_to_spec(&note);
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let _ = open_or_update_note_window(&app, &spec);
    });
    Ok(())
}

fn bootstrap_windows(app: &AppHandle) -> Result<(), String> {
    let mut state = load_notes(app)?;
    if state.notes.is_empty() {
        state.notes.push(default_note(1, app, 0)?);
        save_notes(app, &state, false)?;
    }
    for note in &state.notes.clone() {
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
    load_notes(&app)
}

#[tauri::command]
fn patch_note_cmd(app: AppHandle, note_id: u32, patch: NotePatch) -> Result<(), String> {
    let mut state = load_notes(&app)?;
    let Some(note) = state.notes.iter_mut().find(|note| note.id == note_id) else {
        return Ok(());
    };
    apply_note_patch(note, &patch);
    if patch.content.is_some() {
        let _ = sync_note_images(&app, note_id, &note.content);
    }
    save_notes(&app, &state, false)
}

#[tauri::command]
fn close_note_data_cmd(app: AppHandle, note_id: u32) -> Result<(), String> {
    let mut state = load_notes(&app)?;
    let Some(index) = state.notes.iter().position(|note| note.id == note_id) else {
        destroy_note_window(&app, note_id);
        return Ok(());
    };

    let note = state.notes.remove(index);
    if has_note_content(&note) {
        state.closed_notes.retain(|item| item.id != note_id);
        state.closed_notes.insert(0, note);
    } else {
        state.saved_at_map.remove(&note_id);
        let _ = delete_note_assets(&app, note_id);
    }

    save_notes(&app, &state, true)?;
    Ok(())
}

#[tauri::command]
fn restore_note_cmd(app: AppHandle, note_id: u32) -> Result<(), String> {
    let mut state = load_notes(&app)?;
    let Some(index) = state
        .closed_notes
        .iter()
        .position(|note| note.id == note_id)
    else {
        return Ok(());
    };

    let note = state.closed_notes.remove(index);
    state.notes.push(note.clone());
    save_notes(&app, &state, true)?;
    open_or_update_note_window(&app, &note_to_spec(&note)).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_closed_note_cmd(app: AppHandle, note_id: u32) -> Result<(), String> {
    let mut state = load_notes(&app)?;
    state.closed_notes.retain(|note| note.id != note_id);
    state.saved_at_map.remove(&note_id);
    let _ = delete_note_assets(&app, note_id);
    save_notes(&app, &state, true)
}

#[tauri::command]
fn apply_theme_cmd(app: AppHandle, theme: String) -> Result<(), String> {
    let mut state = load_notes(&app)?;
    for note in &mut state.notes {
        note.theme = theme.clone();
    }
    save_notes(&app, &state, true)
}

#[tauri::command]
fn cycle_theme_cmd(app: AppHandle) -> Result<(), String> {
    let themes = ["business", "eyecare", "dark"];
    let mut state = load_notes(&app)?;
    if state.notes.is_empty() {
        return Ok(());
    }
    let current = state.notes[0].theme.as_str();
    let current_idx = themes.iter().position(|theme| *theme == current).unwrap_or(0);
    let next_theme = themes[(current_idx + 1) % themes.len()];
    for note in &mut state.notes {
        note.theme = next_theme.to_string();
    }
    save_notes(&app, &state, true)
}

#[tauri::command]
fn touch_saved_at_cmd(app: AppHandle, note_id: u32) -> Result<(), String> {
    let mut state = load_notes(&app)?;
    if !state.notes.iter().any(|note| note.id == note_id) {
        return Ok(());
    }
    state.saved_at_map.insert(note_id, chrono_timestamp_ms());
    save_notes(&app, &state, false)
}

fn chrono_timestamp_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

#[tauri::command]
fn save_note_image_cmd(
    app: AppHandle,
    note_id: u32,
    data: Vec<u8>,
    extension: Option<String>,
) -> Result<String, String> {
    if data.is_empty() {
        return Err("empty image data".into());
    }
    let ext = extension.as_deref().unwrap_or("png");
    let filename = new_image_filename(ext);
    let dir = note_images_dir(&app, note_id)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(&filename);
    fs::write(path, data).map_err(|e| e.to_string())?;
    Ok(format!("images/{}", filename))
}

#[tauri::command]
fn read_note_image_data_url_cmd(
    app: AppHandle,
    note_id: u32,
    relative_path: String,
) -> Result<String, String> {
    read_note_image_data_url(&app, note_id, &relative_path)
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
    open_or_update_note_window(&app, &note).map_err(|e| e.to_string())
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
    let quit = MenuItemBuilder::with_id("quit", "退出应用").build(app)?;

    MenuBuilder::new(app)
        .item(&show_notes)
        .item(&new_note)
        .item(&color_menu)
        .item(&settings_menu)
        .item(&toggle_dark)
        .separator()
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
        .tooltip("便签")
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
            "toggle-dark" => emit_toggle_app_theme(app),
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
    let mut builder = tauri::Builder::default()
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
            get_settings_cmd,
            set_last_note_close_cmd,
            save_note_image_cmd,
            read_note_image_data_url_cmd,
            resolve_note_image_path_cmd,
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
