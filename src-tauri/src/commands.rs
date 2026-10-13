//! The command surface the UI talks to. Mutating commands return the fresh `StateDto`.

use crate::config::bookmarks::{self, BookmarkImport};
use crate::config::templates::{self, ResolvedPortal};
use crate::config::{Config, Customer};
use crate::state::{now, Settings, Shared, Timer};
use crate::{browser, tenant, windows};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_autostart::ManagerExt as _;
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_dialog::DialogExt;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StateDto {
    config: Config,
    settings: Settings,
    portals: HashMap<String, Vec<ResolvedPortal>>,
    builtin_portals: Vec<crate::config::PortalDef>,
    config_path: String,
    load_error: Option<String>,
    now: i64,
}

pub struct LoadError(pub Option<String>);

pub fn snapshot(app: &AppHandle) -> StateDto {
    let shared = app.state::<Shared>();
    let s = shared.lock().unwrap();
    let load_error = app.state::<std::sync::Mutex<LoadError>>().lock().unwrap().0.clone();
    StateDto {
        portals: s.config.customers.iter().map(|c| (c.id.clone(), templates::resolve_for(&s.config, c))).collect(),
        config: s.config.clone(),
        settings: s.settings.clone(),
        builtin_portals: templates::builtin_portals(),
        config_path: s.config_path().display().to_string(),
        load_error,
        now: now(),
    }
}

fn changed(app: &AppHandle) -> StateDto {
    let _ = app.emit("state-changed", ());
    snapshot(app)
}

#[tauri::command]
pub fn get_state(app: AppHandle) -> StateDto {
    snapshot(&app)
}

#[tauri::command]
pub fn save_config(app: AppHandle, state: State<Shared>, config: Config) -> Result<StateDto, String> {
    {
        let mut s = state.lock().unwrap();
        let auth = config.auth.clone();
        s.config = config;
        s.config.auth = auth;
        s.config.normalize();
        let cfg = s.config.clone();
        s.settings.prune(&cfg);
        s.save_config()?;
        s.save_settings()?;
    }
    spawn_resolve_missing(&app);
    Ok(changed(&app))
}

#[tauri::command]
pub async fn resolve_tenant(domain: String) -> Result<String, String> {
    tenant::resolve(&domain).await
}

/// Looks up tenant IDs for customers that have a domain but no ID yet (in the background).
pub fn spawn_resolve_missing(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let todo: Vec<(String, String)> = {
            let s = app.state::<Shared>();
            let s = s.lock().unwrap();
            s.config
                .customers
                .iter()
                .filter(|c| c.tenant_id.is_none() && tenant::valid_domain(&c.initial_domain))
                .map(|c| (c.id.clone(), c.initial_domain.clone()))
                .collect()
        };
        if todo.is_empty() {
            return;
        }
        let mut set = tokio::task::JoinSet::new();
        for (id, domain) in todo {
            set.spawn(async move { (id, tenant::resolve(&domain).await) });
        }
        let mut found = vec![];
        while let Some(Ok((id, Ok(tid)))) = set.join_next().await {
            found.push((id, tid));
        }
        if found.is_empty() {
            return;
        }
        {
            let s = app.state::<Shared>();
            let mut s = s.lock().unwrap();
            for (id, tid) in found {
                if let Some(c) = s.config.customers.iter_mut().find(|c| c.id == id) {
                    c.tenant_id = Some(tid);
                }
            }
            let _ = s.save_config();
        }
        let _ = app.emit("state-changed", ());
    });
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SettingsPatch {
    browser: Option<String>,
    profile: Option<String>,
    favorites: Option<Vec<String>>,
    shortcut: Option<String>,
    autostart: Option<bool>,
    notify: Option<bool>,
    open_after: Option<bool>,
}

#[tauri::command]
pub fn save_settings(app: AppHandle, state: State<Shared>, patch: SettingsPatch) -> Result<StateDto, String> {
    let (shortcut_changed, autostart) = {
        let mut s = state.lock().unwrap();
        let st = &mut s.settings;
        if let Some(v) = patch.browser { st.browser = v; }
        if let Some(v) = patch.profile { st.profile = v; }
        if let Some(v) = patch.favorites { st.favorites = v; }
        if let Some(v) = patch.notify { st.notify = v; }
        if let Some(v) = patch.open_after { st.open_after = v; }
        let shortcut_changed = patch.shortcut.filter(|v| *v != st.shortcut).map(|v| { st.shortcut = v.clone(); v });
        let autostart = patch.autostart.filter(|v| *v != st.autostart).inspect(|v| st.autostart = *v);
        s.save_settings()?;
        (shortcut_changed, autostart)
    };
    if let Some(on) = autostart {
        let al = app.autolaunch();
        let _ = if on { al.enable() } else { al.disable() };
    }
    if let Some(sc) = shortcut_changed {
        crate::register_shortcut(&app, &sc)?;
    }
    Ok(changed(&app))
}

#[tauri::command]
pub fn copy_text(app: AppHandle, text: String) -> Result<(), String> {
    app.clipboard().write_text(text).map_err(|e| e.to_string())
}

fn find_customer(cfg: &Config, id: &str) -> Result<Customer, String> {
    cfg.customers.iter().find(|c| c.id == id).cloned().ok_or_else(|| "Onbekende klant".to_string())
}

pub fn open_portal_inner(app: &AppHandle, customer_id: &str, portal_id: &str) -> Result<String, String> {
    let shared = app.state::<Shared>();
    let (url, browser_name, profile) = {
        let mut s = shared.lock().unwrap();
        let c = find_customer(&s.config, customer_id)?;
        let portal = templates::resolve_for(&s.config, &c)
            .into_iter()
            .find(|p| p.id == portal_id)
            .ok_or_else(|| "Onbekend portaal".to_string())?;
        let url = portal.url.ok_or_else(|| portal.missing.unwrap_or_else(|| "Link onvolledig".into()))?;
        s.settings.touch_recent(customer_id);
        let _ = s.save_settings();
        (url, s.settings.browser.clone(), s.settings.profile.clone())
    };
    browser::open(&url, &browser_name, &profile)?;
    Ok(url)
}

#[tauri::command]
pub fn open_portal(app: AppHandle, customer_id: String, portal_id: String) -> Result<String, String> {
    open_portal_inner(&app, &customer_id, &portal_id)
}

/// PIM without a Graph connection: open the PIM page and put the group name on the clipboard.
#[tauri::command]
pub fn start_handoff(app: AppHandle, state: State<Shared>, customer_id: String, ticket: String) -> Result<String, String> {
    if ticket.trim().is_empty() {
        return Err("Vul een ticketnummer in".into());
    }
    let (group, pim_url, browser_name, profile) = {
        let mut s = state.lock().unwrap();
        let c = find_customer(&s.config, &customer_id)?;
        let group = c.pim_groups.first().cloned().unwrap_or_else(|| s.config.group_for(&c.name));
        s.settings.touch_recent(&customer_id);
        let _ = s.save_settings();
        (group, s.config.defaults.pim_url.clone(), s.settings.browser.clone(), s.settings.profile.clone())
    };
    app.clipboard().write_text(group.clone()).map_err(|e| e.to_string())?;
    browser::open(&pim_url, &browser_name, &profile)?;
    Ok(group)
}

#[tauri::command]
pub fn reopen_pim(app: AppHandle, state: State<Shared>) -> Result<(), String> {
    let (url, b, p) = {
        let s = state.lock().unwrap();
        (s.config.defaults.pim_url.clone(), s.settings.browser.clone(), s.settings.profile.clone())
    };
    let _ = &app;
    browser::open(&url, &b, &p)
}

#[tauri::command]
pub fn confirm_activation(app: AppHandle, state: State<Shared>, customer_id: String, ticket: String, duration_minutes: u32) -> Result<StateDto, String> {
    {
        let mut s = state.lock().unwrap();
        find_customer(&s.config, &customer_id)?;
        let t = now();
        let delay = i64::from(s.config.defaults.gdap_delay_minutes) * 60;
        let open = s.settings.open_after;
        s.settings.timers.insert(
            customer_id,
            Timer {
                started_at: t,
                ends_at: t + i64::from(duration_minutes) * 60,
                ticket,
                duration_minutes,
                warned: false,
                open_portal: open.then(|| "m365".to_string()),
                open_at: open.then_some(t + delay),
            },
        );
        s.save_settings()?;
    }
    Ok(changed(&app))
}

#[tauri::command]
pub fn end_activation(app: AppHandle, state: State<Shared>, customer_id: String) -> Result<StateDto, String> {
    {
        let mut s = state.lock().unwrap();
        s.settings.timers.remove(&customer_id);
        s.save_settings()?;
    }
    Ok(changed(&app))
}

#[tauri::command]
pub async fn pick_bookmarks(app: AppHandle) -> Result<Option<BookmarkImport>, String> {
    let _guard = windows::modal_guard();
    let Some(file) = app.dialog().file().add_filter("Favorieten (HTML)", &["html", "htm"]).blocking_pick_file() else {
        return Ok(None);
    };
    let path = file.into_path().map_err(|e| e.to_string())?;
    let html = std::fs::read_to_string(path).map_err(|e| format!("Kan bestand niet lezen: {e}"))?;
    let result = bookmarks::parse(&html);
    if result.candidates.is_empty() {
        return Err("Geen klanten gevonden. Zoek je een map met Microsoft-adminlinks erin?".into());
    }
    Ok(Some(result))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportCandidate {
    name: String,
    initial_domain: Option<String>,
    tenant_id: Option<String>,
}

#[tauri::command]
pub fn apply_import(
    app: AppHandle,
    state: State<Shared>,
    candidates: Vec<ImportCandidate>,
    pim_url: Option<String>,
    group_template: Option<String>,
) -> Result<StateDto, String> {
    {
        let mut s = state.lock().unwrap();
        if let Some(t) = group_template.filter(|t| !t.trim().is_empty()) {
            s.config.defaults.pim_group_template = t;
        }
        if let Some(u) = pim_url.filter(|u| u.starts_with("http")) {
            s.config.defaults.pim_url = u;
        }
        let incoming: Vec<Customer> = candidates
            .into_iter()
            .map(|c| {
                let group = s.config.group_for(&c.name);
                Customer {
                    name: c.name,
                    initial_domain: c.initial_domain.unwrap_or_default(),
                    tenant_id: c.tenant_id,
                    pim_groups: vec![group],
                    ..Default::default()
                }
            })
            .collect();
        let mut add = Config::default();
        add.customers = incoming;
        add.normalize();
        s.config.merge_from(add);
        s.save_config()?;
    }
    spawn_resolve_missing(&app);
    Ok(changed(&app))
}

#[tauri::command]
pub async fn import_config(app: AppHandle) -> Result<Option<usize>, String> {
    let incoming = {
        let _guard = windows::modal_guard();
        let Some(file) = app.dialog().file().add_filter("Eleveren-config", &["json"]).blocking_pick_file() else {
            return Ok(None);
        };
        let path = file.into_path().map_err(|e| e.to_string())?;
        let text = std::fs::read_to_string(path).map_err(|e| format!("Kan bestand niet lezen: {e}"))?;
        Config::parse(&text)?
    };
    let added = {
        let state = app.state::<Shared>();
        let mut s = state.lock().unwrap();
        let mut incoming = incoming;
        incoming.auth = incoming.auth.or(s.config.auth.clone());
        let added = s.config.merge_from(incoming);
        s.save_config()?;
        added
    };
    spawn_resolve_missing(&app);
    let _ = app.emit("state-changed", ());
    Ok(Some(added))
}

#[tauri::command]
pub async fn export_config(app: AppHandle) -> Result<Option<String>, String> {
    let json = {
        let state = app.state::<Shared>();
        let s = state.lock().unwrap();
        serde_json::to_string_pretty(&s.config).map_err(|e| e.to_string())?
    };
    let _guard = windows::modal_guard();
    let Some(file) = app.dialog().file().set_file_name("eleveren-config.json").add_filter("Eleveren-config", &["json"]).blocking_save_file() else {
        return Ok(None);
    };
    let path = file.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| format!("Kan niet schrijven: {e}"))?;
    Ok(Some(path.display().to_string()))
}

#[derive(Serialize)]
pub struct ProfileDto {
    dir: String,
    name: String,
}

#[tauri::command]
pub fn list_browser_profiles(browser: String) -> Vec<ProfileDto> {
    browser::list_profiles(&browser).into_iter().map(|(dir, name)| ProfileDto { dir, name }).collect()
}

#[tauri::command]
pub fn open_settings_window(app: AppHandle, tab: Option<String>) -> Result<(), String> {
    windows::open_settings(&app, tab.as_deref())
}

#[tauri::command]
pub fn hide_panel(app: AppHandle) {
    windows::hide_panel(&app);
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}
