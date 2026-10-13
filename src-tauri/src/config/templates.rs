//! Built-in admin portals and URL template rendering.
//!
//! Templates follow the per-tenant links CIPP uses (`src/data/portals.json` in
//! KelvinTegelaar/CIPP). Variables: `{initialDomain}`, `{tenantId}`, `{defaultDomain}`,
//! `{tenantPrefix}` (the part before `.onmicrosoft.com`) and `{name}`.

use super::{Config, Customer, PortalDef};
use serde::Serialize;

pub fn builtin_portals() -> Vec<PortalDef> {
    let p = |id: &str, label: &str, url: &str| PortalDef {
        id: id.into(),
        label: label.into(),
        url: url.into(),
        icon: Some(id.into()),
        enabled_by_default: true,
    };
    vec![
        p("m365", "M365 admin center", "https://admin.cloud.microsoft/?delegatedOrg={initialDomain}"),
        p("exchange", "Exchange", "https://admin.cloud.microsoft/exchange?landingpage=homepage&form=mac_sidebar&delegatedOrg={initialDomain}"),
        p("entra", "Entra", "https://entra.microsoft.com/{tenantId}"),
        p("teams", "Teams", "https://admin.teams.microsoft.com/?delegatedOrg={initialDomain}"),
        p("azure", "Azure", "https://portal.azure.com/{tenantId}"),
        p("intune", "Intune", "https://intune.microsoft.com/{tenantId}"),
        p("sharepoint", "SharePoint", "https://{tenantPrefix}-admin.sharepoint.com"),
        p("defender", "Defender", "https://security.microsoft.com/?tid={tenantId}"),
        p("purview", "Purview", "https://purview.microsoft.com/?tid={tenantId}"),
        p("powerplatform", "Power Platform", "https://admin.powerplatform.microsoft.com/account/login/{tenantId}"),
        p("powerbi", "Power BI", "https://app.powerbi.com/admin-portal?ctid={tenantId}"),
    ]
}

/// Built-ins with the config's overrides applied (same id replaces), custom portals appended.
pub fn effective_portals(cfg: &Config) -> Vec<PortalDef> {
    let mut list = builtin_portals();
    for custom in &cfg.portals {
        match list.iter_mut().find(|p| p.id == custom.id) {
            Some(existing) => *existing = custom.clone(),
            None => list.push(custom.clone()),
        }
    }
    list
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ResolvedPortal {
    pub id: String,
    pub label: String,
    pub icon: Option<String>,
    /// `None` when a variable the template needs is unknown for this customer.
    pub url: Option<String>,
    pub missing: Option<String>,
}

pub fn tenant_prefix(initial_domain: &str) -> Option<String> {
    let d = initial_domain.trim().to_lowercase();
    d.strip_suffix(".onmicrosoft.com").filter(|p| !p.is_empty()).map(str::to_string)
}

pub fn render(template: &str, c: &Customer) -> Result<String, String> {
    let vars: [(&str, Option<String>, &str); 5] = [
        ("{initialDomain}", Some(c.initial_domain.clone()).filter(|d| !d.is_empty()), "onmicrosoft-domein"),
        ("{tenantId}", c.tenant_id.clone(), "tenant-ID"),
        ("{defaultDomain}", c.default_domain.clone().or_else(|| Some(c.initial_domain.clone()).filter(|d| !d.is_empty())), "standaarddomein"),
        ("{tenantPrefix}", tenant_prefix(&c.initial_domain), "onmicrosoft-domein"),
        ("{name}", Some(c.name.clone()), "naam"),
    ];
    let mut out = template.to_string();
    for (key, value, label) in vars {
        if out.contains(key) {
            match value {
                Some(v) => out = out.replace(key, &encode(&v)),
                None => return Err(format!("{label} ontbreekt")),
            }
        }
    }
    Ok(out)
}

/// Percent-encodes everything outside RFC 3986's unreserved set, so values are safe in
/// a path segment and a query alike.
fn encode(s: &str) -> String {
    let mut out = String::new();
    for b in s.bytes() {
        if b.is_ascii_alphanumeric() || b"-._~".contains(&b) {
            out.push(b as char);
        } else {
            out.push_str(&format!("%{b:02X}"));
        }
    }
    out
}

pub fn resolve_for(cfg: &Config, c: &Customer) -> Vec<ResolvedPortal> {
    effective_portals(cfg)
        .into_iter()
        .filter(|p| match &c.portals {
            Some(ids) => ids.contains(&p.id),
            None => p.enabled_by_default,
        })
        .map(|p| {
            let rendered = if p.id == "sharepoint" {
                match &c.sharepoint_admin_url {
                    Some(u) => Ok(u.clone()),
                    None => render(&p.url, c),
                }
            } else {
                render(&p.url, c)
            };
            let (url, missing) = match rendered {
                Ok(u) => (Some(u), None),
                Err(e) => (None, Some(e)),
            };
            ResolvedPortal { id: p.id, label: p.label, icon: p.icon, url, missing }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn contoso() -> Customer {
        Customer {
            id: "contoso".into(),
            name: "Contoso".into(),
            initial_domain: "contoso.onmicrosoft.com".into(),
            tenant_id: Some("00000000-0000-0000-0000-000000000001".into()),
            ..Default::default()
        }
    }

    #[test]
    fn renders_every_builtin_for_a_complete_customer() {
        let cfg = Config::default();
        let list = resolve_for(&cfg, &contoso());
        assert_eq!(list.len(), 11);
        assert!(list.iter().all(|p| p.url.is_some()), "{list:?}");
        let get = |id: &str| list.iter().find(|p| p.id == id).unwrap().url.clone().unwrap();
        assert_eq!(get("m365"), "https://admin.cloud.microsoft/?delegatedOrg=contoso.onmicrosoft.com");
        assert_eq!(get("entra"), "https://entra.microsoft.com/00000000-0000-0000-0000-000000000001");
        assert_eq!(get("sharepoint"), "https://contoso-admin.sharepoint.com");
        assert_eq!(get("powerbi"), "https://app.powerbi.com/admin-portal?ctid=00000000-0000-0000-0000-000000000001");
    }

    #[test]
    fn reports_missing_tenant_id() {
        let mut c = contoso();
        c.tenant_id = None;
        let list = resolve_for(&Config::default(), &c);
        let entra = list.iter().find(|p| p.id == "entra").unwrap();
        assert!(entra.url.is_none());
        assert_eq!(entra.missing.as_deref(), Some("tenant-ID ontbreekt"));
        assert!(list.iter().find(|p| p.id == "m365").unwrap().url.is_some());
    }

    #[test]
    fn respects_customer_portal_selection_and_overrides() {
        let mut cfg = Config::default();
        cfg.portals.push(PortalDef {
            id: "cipp".into(),
            label: "CIPP".into(),
            url: "https://cipp.example.com/?tenantFilter={initialDomain}".into(),
            icon: None,
            enabled_by_default: true,
        });
        let mut c = contoso();
        c.portals = Some(vec!["m365".into(), "cipp".into()]);
        c.sharepoint_admin_url = Some("https://custom-admin.sharepoint.com".into());
        let list = resolve_for(&cfg, &c);
        assert_eq!(list.iter().map(|p| p.id.as_str()).collect::<Vec<_>>(), vec!["m365", "cipp"]);
        assert_eq!(list[1].url.as_deref(), Some("https://cipp.example.com/?tenantFilter=contoso.onmicrosoft.com"));
    }

    #[test]
    fn sharepoint_override_wins() {
        let mut c = contoso();
        c.sharepoint_admin_url = Some("https://renamed-admin.sharepoint.com".into());
        let list = resolve_for(&Config::default(), &c);
        assert_eq!(list.iter().find(|p| p.id == "sharepoint").unwrap().url.as_deref(), Some("https://renamed-admin.sharepoint.com"));
    }

    #[test]
    fn encodes_values() {
        let mut c = contoso();
        c.name = "A&B Co".into();
        assert_eq!(render("x?n={name}", &c).unwrap(), "x?n=A%26B%20Co");
    }
}
