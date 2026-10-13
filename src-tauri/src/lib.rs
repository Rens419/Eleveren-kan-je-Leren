mod browser;
mod commands;
mod config;
mod state;
mod tenant;
mod timers;
mod windows;

use state::{AppState, Shared};
use std::sync::atomic::Ordering;
use std::sync::Mutex;
use tauri::menu::{Menu, MenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, WindowEvent};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::{GlobalShortcutExt, ShortcutState};

pub fn register_shortcut(app: &AppHandle, shortcut: &str) -> Result<(), String> {
    let gs = app.global_shortcut();
    let _ = gs.unregister_all();
    if shortcut.trim().is_empty() {
        return Ok(());
    }
    gs.register(shortcut).map_err(|e| format!("Sneltoets niet beschikbaar: {e}"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_positioner::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(|app, _shortcut, event| {
                    if event.state() == ShortcutState::Pressed {
                        windows::toggle_panel(app);
                    }
                })
                .build(),
        )
        .invoke_handler(tauri::generate_handler![
            commands::get_state,
            commands::save_config,
            commands::save_settings,
            commands::resolve_tenant,
            commands::copy_text,
            commands::open_portal,
            commands::start_handoff,
            commands::reopen_pim,
            commands::confirm_activation,
            commands::end_activation,
            commands::pick_bookmarks,
            commands::apply_import,
            commands::import_config,
            commands::export_config,
            commands::list_browser_profiles,
            commands::open_settings_window,
            commands::hide_panel,
            commands::quit_app,
        ])
        .setup(|app| {
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            let dir = app.path().app_config_dir()?;
            let (st, load_error) = AppState::load(dir);
            let shortcut = st.settings.shortcut.clone();
            app.manage::<Shared>(Mutex::new(st));
            app.manage(Mutex::new(commands::LoadError(load_error)));

            if let Some(panel) = app.get_webview_window("panel") {
                let handle = app.handle().clone();
                panel.on_window_event(move |event| {
                    if let WindowEvent::Focused(false) = event {
                        if !windows::MODAL.load(Ordering::SeqCst) {
                            windows::hide_panel(&handle);
                        }
                    }
                });
            }

            let settings_item = MenuItem::with_id(app, "settings", "Instellingen…", true, Some("CmdOrCtrl+,"))?;
            let quit_item = MenuItem::with_id(app, "quit", "Eleveren afsluiten", true, Some("CmdOrCtrl+Q"))?;
            let menu = Menu::with_items(app, &[&settings_item, &quit_item])?;
            TrayIconBuilder::with_id("main")
                .icon(tauri::image::Image::from_bytes(include_bytes!("../icons/tray.png"))?)
                .icon_as_template(true)
                .tooltip("Eleveren")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "settings" => {
                        let _ = windows::open_settings(app, None);
                    }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    tauri_plugin_positioner::on_tray_event(tray.app_handle(), &event);
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        windows::toggle_panel(tray.app_handle());
                    }
                })
                .build(app)?;

            if let Err(e) = register_shortcut(app.handle(), &shortcut) {
                eprintln!("{e}");
            }
            commands::spawn_resolve_missing(app.handle());
            timers::spawn(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Eleveren");
}
