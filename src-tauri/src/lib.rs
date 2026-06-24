use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;

use tauri::{
    include_image,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, RunEvent, State, WebviewWindow, WindowEvent,
};
use tauri_plugin_global_shortcut::{Code, GlobalShortcutExt, Modifiers, Shortcut, ShortcutState};

struct AppState {
    renderer_ready: AtomicBool,
    pending_new_note: AtomicBool,
}

fn main_window(app: &tauri::AppHandle) -> Option<WebviewWindow> {
    app.get_webview_window("main")
}

fn emit_to_main(app: &tauri::AppHandle, event: &str) {
    if let Some(window) = main_window(app) {
        let _ = window.emit(event, ());
    }
}

fn show_main_window(app: &tauri::AppHandle) {
    if let Some(window) = main_window(app) {
        if let Ok(Some(monitor)) = window.current_monitor() {
            let size = monitor.size();
            let _ = window.set_size(tauri::Size::Physical(*size));
            let _ = window.set_position(tauri::Position::Physical(
                tauri::PhysicalPosition { x: 0, y: 0 },
            ));
        }
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

fn hide_main_window(app: &tauri::AppHandle) {
    emit_to_main(app, "tray-menu-hide");
    if let Some(window) = main_window(app) {
        let _ = window.hide();
    }
}

fn show_notes(app: &tauri::AppHandle) {
    show_main_window(app);
    if let Some(window) = main_window(app) {
        let _ = window.set_ignore_cursor_events(false);
    }
    emit_to_main(app, "tray-show-notes");
}

fn request_new_note(app: &tauri::AppHandle, state: &AppState) {
    show_main_window(app);
    if state.renderer_ready.load(Ordering::SeqCst) {
        let app = app.clone();
        thread::spawn(move || {
            thread::sleep(Duration::from_millis(120));
            emit_to_main(&app, "new-note");
        });
    } else {
        state.pending_new_note.store(true, Ordering::SeqCst);
    }
}

fn toggle_tray_menu(app: &tauri::AppHandle) {
    show_main_window(app);
    emit_to_main(app, "tray-menu-toggle");
}

#[tauri::command]
fn renderer_ready(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    state.renderer_ready.store(true, Ordering::SeqCst);
    if state.pending_new_note.swap(false, Ordering::SeqCst) {
        emit_to_main(&app, "new-note");
    }
    Ok(())
}

#[tauri::command]
fn hide_main_window_cmd(app: tauri::AppHandle) -> Result<(), String> {
    hide_main_window(&app);
    Ok(())
}

#[tauri::command]
fn show_notes_cmd(app: tauri::AppHandle) -> Result<(), String> {
    show_notes(&app);
    Ok(())
}

#[tauri::command]
fn set_ignore_cursor_events(app: tauri::AppHandle, ignore: bool) -> Result<(), String> {
    if let Some(window) = main_window(&app) {
        window
            .set_ignore_cursor_events(ignore)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn quit_app(app: tauri::AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn set_always_on_top(app: tauri::AppHandle, always_on_top: bool) -> Result<(), String> {
    if let Some(window) = main_window(&app) {
        window
            .set_always_on_top(always_on_top)
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn request_tray_new_note(app: tauri::AppHandle, state: State<'_, AppState>) -> Result<(), String> {
    request_new_note(&app, &state);
    Ok(())
}

fn build_tray(app: &tauri::AppHandle) -> tauri::Result<()> {
    let tray_icon = include_image!("icons/tray-icon.png");

    let _tray = TrayIconBuilder::new()
        .icon(tray_icon)
        .tooltip("便签")
        .show_menu_on_left_click(false)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                match button {
                    MouseButton::Left => show_notes(tray.app_handle()),
                    MouseButton::Right => toggle_tray_menu(tray.app_handle()),
                    _ => {}
                }
            }
        })
        .build(app)?;

    Ok(())
}

fn register_shortcut(app: &tauri::AppHandle) {
    let shortcut = Shortcut::new(Some(Modifiers::CONTROL), Code::KeyN);
    let app_handle = app.clone();

    let _ = app.global_shortcut().on_shortcut(shortcut, move |_, _, event| {
        if event.state == ShortcutState::Pressed {
            if let Some(state) = app_handle.try_state::<AppState>() {
                request_new_note(&app_handle, &state);
            }
        }
    });

    let _ = app.global_shortcut().register(shortcut);
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let app_state = AppState {
        renderer_ready: AtomicBool::new(false),
        pending_new_note: AtomicBool::new(false),
    };

    let mut builder = tauri::Builder::default()
        .manage(app_state)
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            renderer_ready,
            hide_main_window_cmd,
            show_notes_cmd,
            set_ignore_cursor_events,
            quit_app,
            set_always_on_top,
            request_tray_new_note,
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            if let Some(window) = main_window(app.handle()) {
                if let Ok(Some(monitor)) = window.current_monitor() {
                    let size = monitor.size();
                    let _ = window.set_size(tauri::Size::Physical(*size));
                    let _ = window.set_position(tauri::Position::Physical(
                        tauri::PhysicalPosition { x: 0, y: 0 },
                    ));
                }
                let _ = window.show();
            }

            build_tray(app.handle())?;
            register_shortcut(app.handle());

            Ok(())
        });

    builder = builder.on_window_event(|window, event| {
        if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            hide_main_window(window.app_handle());
        }
    });

    builder
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app, event| {
            if let RunEvent::Ready = event {
                show_main_window(app);
            }
        });
}
