//! Imports customers from a browser bookmarks export (Netscape HTML, as written by
//! Edge, Chrome, Safari and Firefox). Runs fully locally.
//!
//! A folder that directly contains Microsoft admin links becomes one customer: its name
//! is the folder name, its onmicrosoft domain and tenant ID are read from the link URLs
//! (`delegatedOrg=`, `tid=`, `ctid=`, a GUID path segment, `*.onmicrosoft.com`).

use regex::Regex;
use serde::Serialize;

#[derive(Debug, Clone, Serialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Candidate {
    pub name: String,
    pub initial_domain: Option<String>,
    pub tenant_id: Option<String>,
    pub link_count: usize,
}

#[derive(Debug, Clone, Serialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct BookmarkImport {
    pub candidates: Vec<Candidate>,
    /// A bookmark that looks like the PIM page (title or URL mentions PIM).
    pub pim_url: Option<String>,
    /// Folders that held links but nothing we recognise as a customer.
    pub skipped: Vec<String>,
}

struct Folder {
    name: String,
    links: Vec<(String, String)>,
}

pub fn parse(html: &str) -> BookmarkImport {
    let token = Regex::new(r#"(?is)<h3[^>]*>(.*?)</h3>|<dl[^>]*>|</dl>|<a\s[^>]*?href\s*=\s*"([^"]*)"[^>]*>(.*?)</a>"#).unwrap();
    let mut stack: Vec<Folder> = vec![];
    let mut finished: Vec<Folder> = vec![];
    let mut pending: Option<String> = None;
    let mut all_links: Vec<(String, String)> = vec![];

    for cap in token.captures_iter(html) {
        let whole = cap.get(0).unwrap().as_str().to_lowercase();
        if let Some(name) = cap.get(1) {
            pending = Some(unescape(name.as_str()));
        } else if whole.starts_with("<dl") {
            stack.push(Folder { name: pending.take().unwrap_or_default(), links: vec![] });
        } else if whole.starts_with("</dl") {
            if let Some(f) = stack.pop() {
                finished.push(f);
            }
        } else if let Some(href) = cap.get(2) {
            let title = unescape(&strip_tags(cap.get(3).map(|m| m.as_str()).unwrap_or("")));
            let url = unescape(href.as_str());
            all_links.push((title.clone(), url.clone()));
            if let Some(top) = stack.last_mut() {
                top.links.push((title, url));
            }
        }
    }

    let domain_re = Regex::new(r"(?i)([a-z0-9][a-z0-9-]*\.onmicrosoft\.com)").unwrap();
    let delegated_re = Regex::new(r"(?i)delegatedOrg=([^&#]+)").unwrap();
    let guid_re = Regex::new(r"(?i)\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b").unwrap();

    let mut out = BookmarkImport::default();
    for f in finished.iter().filter(|f| !f.name.trim().is_empty()) {
        let ms_links: Vec<_> = f.links.iter().filter(|(_, u)| is_microsoft_admin(u)).collect();
        if ms_links.is_empty() {
            continue;
        }
        let mut domain: Option<String> = None;
        let mut tenant: Option<String> = None;
        for (_, url) in &ms_links {
            let decoded = percent_decode(url);
            if domain.is_none() {
                domain = delegated_re
                    .captures(&decoded)
                    .map(|c| c[1].to_lowercase())
                    .filter(|d| d.ends_with(".onmicrosoft.com"))
                    .or_else(|| domain_re.captures(&decoded).map(|c| c[1].to_lowercase()));
            }
            if tenant.is_none() {
                tenant = guid_re.captures(&decoded).map(|c| c[1].to_lowercase());
            }
        }
        if domain.is_none() && tenant.is_none() {
            out.skipped.push(f.name.trim().to_string());
            continue;
        }
        out.candidates.push(Candidate {
            name: f.name.trim().to_string(),
            initial_domain: domain,
            tenant_id: tenant,
            link_count: ms_links.len(),
        });
    }
    out.candidates.sort_by_key(|c| c.name.to_lowercase());

    out.pim_url = all_links
        .iter()
        .find(|(t, u)| (t.to_lowercase().contains("pim") || u.contains("PIMCommon")) && u.starts_with("http"))
        .map(|(_, u)| u.clone());
    out
}

fn is_microsoft_admin(url: &str) -> bool {
    const HOSTS: [&str; 14] = [
        "admin.cloud.microsoft", "admin.microsoft.com", "entra.microsoft.com", "portal.azure.com",
        "admin.teams.microsoft.com", "intune.microsoft.com", "security.microsoft.com", "purview.microsoft.com",
        "compliance.microsoft.com", "admin.powerplatform.microsoft.com", "make.powerapps.com", "app.powerbi.com",
        "-admin.sharepoint.com", "admin.exchange.microsoft.com",
    ];
    HOSTS.iter().any(|h| url.contains(h))
}

fn strip_tags(s: &str) -> String {
    Regex::new(r"(?s)<[^>]*>").unwrap().replace_all(s, "").trim().to_string()
}

fn unescape(s: &str) -> String {
    s.replace("&amp;", "&").replace("&quot;", "\"").replace("&#39;", "'").replace("&lt;", "<").replace("&gt;", ">").trim().to_string()
}

fn percent_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'%' && i + 2 < b.len() {
            if let Some(v) = s.get(i + 1..i + 3).and_then(|h| u8::from_str_radix(h, 16).ok()) {
                out.push(v);
                i += 3;
                continue;
            }
        }
        out.push(b[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = r##"<!DOCTYPE NETSCAPE-Bookmark-file-1>
<DL><p>
  <DT><H3>Customers</H3>
  <DL><p>
    <DT><H3>Contoso</H3>
    <DL><p>
      <DT><A HREF="https://admin.cloud.microsoft/?delegatedOrg=contoso.onmicrosoft.com">M365 Portal</A>
      <DT><A HREF="https://entra.microsoft.com/00000000-0000-0000-0000-000000000001">Entra Portal</A>
    </DL><p>
    <DT><H3>Fabrikam &amp; Co</H3>
    <DL><p>
      <DT><A HREF="https://portal.azure.com/fabrikam.onmicrosoft.com">Azure</A>
    </DL><p>
    <DT><H3>Woodgrove</H3>
    <DL><p>
      <DT><A HREF="https://security.microsoft.com/?tid=00000000-0000-0000-0000-000000000005">Security</A>
    </DL><p>
    <DT><H3>Recepten</H3>
    <DL><p>
      <DT><A HREF="https://example.com/pasta">Pasta</A>
    </DL><p>
    <DT><A HREF="https://portal.azure.com/#view/Microsoft_Azure_PIMCommon/CommonMenuBlade/~/aadgroup">PIM Activatie</A>
  </DL><p>
</DL><p>"##;

    #[test]
    fn finds_customers_with_domain_and_tenant() {
        let r = parse(FIXTURE);
        let names: Vec<_> = r.candidates.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(names, vec!["Contoso", "Fabrikam & Co", "Woodgrove"]);
        let contoso = &r.candidates[0];
        assert_eq!(contoso.initial_domain.as_deref(), Some("contoso.onmicrosoft.com"));
        assert_eq!(contoso.tenant_id.as_deref(), Some("00000000-0000-0000-0000-000000000001"));
        assert_eq!(contoso.link_count, 2);
        assert_eq!(r.candidates[1].initial_domain.as_deref(), Some("fabrikam.onmicrosoft.com"));
        assert_eq!(r.candidates[2].initial_domain, None);
        assert_eq!(r.candidates[2].tenant_id.as_deref(), Some("00000000-0000-0000-0000-000000000005"));
    }

    #[test]
    fn ignores_unrelated_folders_and_finds_pim_link() {
        let r = parse(FIXTURE);
        assert!(!r.candidates.iter().any(|c| c.name == "Recepten"));
        assert!(r.pim_url.unwrap().contains("PIMCommon"));
    }

    #[test]
    fn empty_input_is_fine() {
        assert_eq!(parse("").candidates.len(), 0);
    }
}
