//! Panel (tray popover) and settings window handling.

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_positioner::{Position, WindowExt};

/// Set while a native file dialog is open, so the panel does not hide when it loses focus.
pub static MODAL: AtomicBool = AtomicBool::new(false);

pub fn toggle_panel(app: &AppHandle) {
    let Some(w) = app.get_webview_window("panel") else { return };
    if w.is_visible().unwrap_or(false) {
        let _ = w.hide();
        return;
    }
    if w.move_window(Position::TrayCenter).is_err() {
        let _ = w.move_window(Position::TopRight);
    }
    let _ = w.show();
    let _ = w.set_focus();
    let _ = app.emit("panel-shown", ());
}

pub fn hide_panel(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("panel") {
        let _ = w.hide();
    }
}

pub fn open_settings(app: &AppHandle, tab: Option<&str>) -> Result<(), String> {
    hide_panel(app);
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.show();
        let _ = w.unminimize();
        let _ = w.set_focus();
        if let Some(t) = tab {
            let _ = app.emit("settings-tab", t.to_string());
        }
        return Ok(());
    }
    let url = match tab {
        Some(t) => format!("index.html?window=settings&tab={t}"),
        None => "index.html?window=settings".to_string(),
    };
    let w = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App(url.into()))
        .title("Eleveren")
        .inner_size(960.0, 640.0)
        .min_inner_size(820.0, 520.0)
        .center()
        .build()
        .map_err(|e| e.to_string())?;
    let _ = w.set_focus();
    Ok(())
}

pub fn modal_guard() -> impl Drop {
    struct Guard;
    impl Drop for Guard {
        fn drop(&mut self) {
            MODAL.store(false, Ordering::SeqCst);
        }
    }
    MODAL.store(true, Ordering::SeqCst);
    Guard
}
