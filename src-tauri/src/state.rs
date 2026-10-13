//! Personal settings and the in-memory app state.

use crate::config::{write_atomic, Config};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

/// A locally tracked PIM activation. Without a Graph connection Eleveren cannot see the
/// real state, so this is what the user told it plus the duration they chose.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Timer {
    pub started_at: i64,
    pub ends_at: i64,
    pub ticket: String,
    pub duration_minutes: u32,
    #[serde(default)]
    pub warned: bool,
    #[serde(default)]
    pub open_portal: Option<String>,
    #[serde(default)]
    pub open_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    /// "default" | "edge" | "chrome" | "brave" | "safari" | "firefox"
    pub browser: String,
    pub profile: String,
    pub favorites: Vec<String>,
    pub recent: Vec<String>,
    pub shortcut: String,
    pub autostart: bool,
    pub notify: bool,
    pub open_after: bool,
    pub timers: HashMap<String, Timer>,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            browser: "default".into(),
            profile: String::new(),
            favorites: vec![],
            recent: vec![],
            shortcut: "CommandOrControl+Alt+E".into(),
            autostart: false,
            notify: true,
            open_after: true,
            timers: HashMap::new(),
        }
    }
}

impl Settings {
    pub fn load(path: &Path) -> Settings {
        std::fs::read_to_string(path).ok().and_then(|s| serde_json::from_str(&s).ok()).unwrap_or_default()
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        write_atomic(path, &serde_json::to_string_pretty(self).map_err(|e| e.to_string())?)
    }

    pub fn touch_recent(&mut self, customer_id: &str) {
        self.recent.retain(|r| r != customer_id);
        self.recent.insert(0, customer_id.to_string());
        self.recent.truncate(8);
    }

    /// Drops references to customers that no longer exist.
    pub fn prune(&mut self, config: &Config) {
        let ids: std::collections::HashSet<_> = config.customers.iter().map(|c| c.id.as_str()).collect();
        self.favorites.retain(|f| ids.contains(f.as_str()));
        self.recent.retain(|f| ids.contains(f.as_str()));
        self.timers.retain(|k, _| ids.contains(k.as_str()));
    }
}

pub struct AppState {
    pub dir: PathBuf,
    pub config: Config,
    pub settings: Settings,
}

impl AppState {
    pub fn load(dir: PathBuf) -> (AppState, Option<String>) {
        let (config, err) = match Config::load(&dir.join("config.json")) {
            Ok(c) => (c.unwrap_or_default(), None),
            Err(e) => (Config::default(), Some(e)),
        };
        let mut settings = Settings::load(&dir.join("settings.json"));
        settings.prune(&config);
        (AppState { dir, config, settings }, err)
    }

    pub fn config_path(&self) -> PathBuf {
        self.dir.join("config.json")
    }

    pub fn save_config(&self) -> Result<(), String> {
        self.config.save(&self.config_path())
    }

    pub fn save_settings(&self) -> Result<(), String> {
        self.settings.save(&self.dir.join("settings.json"))
    }
}

pub type Shared = Mutex<AppState>;

pub fn now() -> i64 {
    std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_secs() as i64).unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recent_is_unique_and_capped() {
        let mut s = Settings::default();
        for i in 0..12 {
            s.touch_recent(&format!("c{i}"));
        }
        s.touch_recent("c5");
        assert_eq!(s.recent[0], "c5");
        assert_eq!(s.recent.len(), 8);
        assert_eq!(s.recent.iter().filter(|r| *r == "c5").count(), 1);
    }

    #[test]
    fn prune_removes_unknown_customers() {
        let cfg = Config::parse(r#"{"customers":[{"name":"Contoso"}]}"#).unwrap();
        let mut s = Settings::default();
        s.favorites = vec!["contoso".into(), "gone".into()];
        s.timers.insert("gone".into(), Timer { started_at: 0, ends_at: 1, ticket: "1".into(), duration_minutes: 60, warned: false, open_portal: None, open_at: None });
        s.prune(&cfg);
        assert_eq!(s.favorites, vec!["contoso".to_string()]);
        assert!(s.timers.is_empty());
    }

    #[test]
    fn settings_roundtrip_through_disk() {
        let dir = std::env::temp_dir().join(format!("eleveren-test-{}", now()));
        let path = dir.join("settings.json");
        let mut s = Settings::default();
        s.browser = "edge".into();
        s.save(&path).unwrap();
        assert_eq!(Settings::load(&path).browser, "edge");
        let _ = std::fs::remove_dir_all(dir);
    }
}
