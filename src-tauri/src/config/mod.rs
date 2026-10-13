//! The shared, shareable configuration: customers, portal templates and team defaults.
//!
//! This file is what colleagues exchange. It holds customer names and domains, so it
//! lives in the app's config directory and never in the repository.

pub mod bookmarks;
pub mod templates;

use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;

pub const CONFIG_VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Config {
    pub version: u32,
    pub defaults: Defaults,
    /// Graph sign-in for one-click activation. `None` until an app registration has consent.
    pub auth: Option<Auth>,
    /// Overrides of built-in portals (same `id`) and extra custom portals.
    pub portals: Vec<PortalDef>,
    pub customers: Vec<Customer>,
}

impl Default for Config {
    fn default() -> Self {
        Self { version: CONFIG_VERSION, defaults: Defaults::default(), auth: None, portals: vec![], customers: vec![] }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Defaults {
    pub ticket_system: Option<String>,
    pub duration_minutes: u32,
    /// `{ticket}` and `{customer}` are replaced.
    pub justification_template: String,
    /// `{name}` is replaced by the customer name with everything but letters and digits removed.
    pub pim_group_template: String,
    pub pim_url: String,
    /// Minutes to wait after activation before "open portal when active" fires (GDAP propagation).
    pub gdap_delay_minutes: u32,
}

/// Internal portal blade route (not a documented API). Importing your own "PIM" bookmark
/// or editing this in Settings is the reliable way to point at the right page.
pub const DEFAULT_PIM_URL: &str =
    "https://aad.portal.azure.com/#view/Microsoft_Azure_PIMCommon/CommonMenuBlade/~/aadgroup";

impl Default for Defaults {
    fn default() -> Self {
        Self {
            ticket_system: None,
            duration_minutes: 240,
            justification_template: "Ticket {ticket} – {customer}".into(),
            pim_group_template: "PIM_{name}".into(),
            pim_url: DEFAULT_PIM_URL.into(),
            gdap_delay_minutes: 3,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Auth {
    pub tenant_id: String,
    pub client_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase", default)]
pub struct Customer {
    pub id: String,
    pub name: String,
    pub initial_domain: String,
    pub tenant_id: Option<String>,
    pub default_domain: Option<String>,
    pub sharepoint_admin_url: Option<String>,
    pub pim_groups: Vec<String>,
    /// Portal ids to show; `None` shows every portal that is enabled by default.
    pub portals: Option<Vec<String>>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PortalDef {
    pub id: String,
    pub label: String,
    pub url: String,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default = "yes")]
    pub enabled_by_default: bool,
}

fn yes() -> bool {
    true
}

impl Config {
    pub fn parse(json: &str) -> Result<Config, String> {
        let mut cfg: Config = serde_json::from_str(json).map_err(|e| format!("Ongeldige config: {e}"))?;
        if cfg.version > CONFIG_VERSION {
            return Err(format!("Config-versie {} is nieuwer dan deze app ondersteunt; werk Eleveren bij.", cfg.version));
        }
        cfg.version = CONFIG_VERSION;
        cfg.normalize();
        Ok(cfg)
    }

    pub fn load(path: &Path) -> Result<Option<Config>, String> {
        match fs::read_to_string(path) {
            Ok(s) => Config::parse(&s).map(Some),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
            Err(e) => Err(format!("Kan config niet lezen: {e}")),
        }
    }

    pub fn save(&self, path: &Path) -> Result<(), String> {
        let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        write_atomic(path, &json)
    }

    /// Trims fields, fills missing ids and makes ids unique, so the rest of the app can
    /// treat `id` as a stable key.
    pub fn normalize(&mut self) {
        let mut seen = std::collections::HashSet::new();
        for c in &mut self.customers {
            c.name = c.name.trim().to_string();
            c.initial_domain = c.initial_domain.trim().to_lowercase();
            c.tenant_id = c.tenant_id.take().map(|t| t.trim().to_lowercase()).filter(|t| !t.is_empty());
            c.default_domain = c.default_domain.take().map(|d| d.trim().to_lowercase()).filter(|d| !d.is_empty());
            c.sharepoint_admin_url = c.sharepoint_admin_url.take().map(|d| d.trim().to_string()).filter(|d| !d.is_empty());
            c.pim_groups = c.pim_groups.iter().map(|g| g.trim().to_string()).filter(|g| !g.is_empty()).collect();
            let base = if c.id.trim().is_empty() { slug(&c.name) } else { slug(&c.id) };
            let base = if base.is_empty() { "klant".to_string() } else { base };
            let mut id = base.clone();
            let mut n = 2;
            while !seen.insert(id.clone()) {
                id = format!("{base}-{n}");
                n += 1;
            }
            c.id = id;
        }
        self.customers.sort_by_key(|c| c.name.to_lowercase());
    }

    /// Brings in another config. On a still-empty config the incoming one replaces it
    /// (defaults, portals and auth included); otherwise only customers we do not know yet
    /// (matched on onmicrosoft domain, then name) are added. Returns how many were added.
    pub fn merge_from(&mut self, incoming: Config) -> usize {
        if self.customers.is_empty() {
            let n = incoming.customers.len();
            *self = incoming;
            self.normalize();
            return n;
        }
        let mut added = 0;
        for c in incoming.customers {
            let known = self.customers.iter().any(|e| {
                (!c.initial_domain.is_empty() && e.initial_domain == c.initial_domain)
                    || e.name.eq_ignore_ascii_case(&c.name)
            });
            if !known {
                self.customers.push(c);
                added += 1;
            }
        }
        self.normalize();
        added
    }

    pub fn group_for(&self, name: &str) -> String {
        let compact: String = name.chars().filter(|c| c.is_ascii_alphanumeric()).collect();
        self.defaults.pim_group_template.replace("{name}", &compact)
    }
}

pub fn slug(s: &str) -> String {
    let mut out = String::new();
    for ch in s.to_lowercase().chars() {
        let mapped = match ch {
            'á' | 'à' | 'ä' | 'â' => 'a',
            'é' | 'è' | 'ë' | 'ê' => 'e',
            'í' | 'ì' | 'ï' | 'î' => 'i',
            'ó' | 'ò' | 'ö' | 'ô' => 'o',
            'ú' | 'ù' | 'ü' | 'û' => 'u',
            c => c,
        };
        if mapped.is_ascii_alphanumeric() {
            out.push(mapped);
        } else if !out.ends_with('-') && !out.is_empty() {
            out.push('-');
        }
    }
    out.trim_end_matches('-').to_string()
}

pub fn write_atomic(path: &Path, contents: &str) -> Result<(), String> {
    if let Some(dir) = path.parent() {
        fs::create_dir_all(dir).map_err(|e| format!("Kan map niet maken: {e}"))?;
    }
    let tmp = path.with_extension("tmp");
    fs::write(&tmp, contents).map_err(|e| format!("Kan niet schrijven: {e}"))?;
    fs::rename(&tmp, path).map_err(|e| format!("Kan niet opslaan: {e}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_minimal_config_with_defaults() {
        let cfg = Config::parse(r#"{"customers":[{"name":" Contoso ","initialDomain":"Contoso.onmicrosoft.com"}]}"#).unwrap();
        assert_eq!(cfg.version, 1);
        assert_eq!(cfg.defaults.duration_minutes, 240);
        assert_eq!(cfg.customers[0].id, "contoso");
        assert_eq!(cfg.customers[0].name, "Contoso");
        assert_eq!(cfg.customers[0].initial_domain, "contoso.onmicrosoft.com");
        assert!(cfg.auth.is_none());
    }

    #[test]
    fn makes_duplicate_ids_unique_and_sorts() {
        let cfg = Config::parse(
            r#"{"customers":[{"name":"Fabrikam"},{"name":"Contoso"},{"name":"Contoso"}]}"#,
        )
        .unwrap();
        let ids: Vec<_> = cfg.customers.iter().map(|c| c.id.as_str()).collect();
        assert_eq!(ids.len(), 3);
        assert!(ids.contains(&"contoso") && ids.contains(&"contoso-2") && ids.contains(&"fabrikam"));
        assert_eq!(cfg.customers[2].name, "Fabrikam");
    }

    #[test]
    fn rejects_newer_version() {
        assert!(Config::parse(r#"{"version":99}"#).is_err());
    }

    #[test]
    fn group_template() {
        let mut cfg = Config::default();
        cfg.defaults.pim_group_template = "G_Cipp_{name}_Editor".into();
        assert_eq!(cfg.group_for("Northwind Traders"), "G_Cipp_NorthwindTraders_Editor");
    }

    #[test]
    fn merge_replaces_empty_and_adds_only_new() {
        let incoming = Config::parse(r#"{"customers":[{"name":"Contoso","initialDomain":"contoso.onmicrosoft.com"}]}"#).unwrap();
        let mut cfg = Config::default();
        assert_eq!(cfg.merge_from(incoming), 1);
        let more = Config::parse(
            r#"{"customers":[{"name":"Contoso Renamed","initialDomain":"contoso.onmicrosoft.com"},{"name":"Fabrikam","initialDomain":"fabrikam.onmicrosoft.com"}]}"#,
        )
        .unwrap();
        assert_eq!(cfg.merge_from(more), 1);
        assert_eq!(cfg.customers.len(), 2);
        assert_eq!(cfg.customers[0].name, "Contoso");
    }

    #[test]
    fn slugs() {
        assert_eq!(slug("Margie’s Travel"), "margie-s-travel");
        assert_eq!(slug("  Café Noël "), "cafe-noel");
    }

    #[test]
    fn example_config_parses() {
        let s = include_str!("../../../examples/config.example.json");
        let cfg = Config::parse(s).unwrap();
        assert!(cfg.customers.len() >= 3);
    }
}
