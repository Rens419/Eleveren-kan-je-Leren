//! Tenant-ID lookup from a domain. Uses the public OpenID configuration endpoint, so
//! no sign-in and no app registration is needed.

use regex::Regex;
use std::time::Duration;

/// `https://login.microsoftonline.com/<tenant guid>/v2.0` → the GUID.
pub fn parse_issuer(issuer: &str) -> Option<String> {
    let re = Regex::new(r"(?i)login\.microsoftonline\.com/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/").unwrap();
    re.captures(issuer).map(|c| c[1].to_lowercase())
}

pub fn valid_domain(domain: &str) -> bool {
    Regex::new(r"^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$").unwrap().is_match(domain)
}

pub async fn resolve(domain: &str) -> Result<String, String> {
    let domain = domain.trim().to_lowercase();
    if !valid_domain(&domain) {
        return Err("Ongeldig domein".into());
    }
    let url = format!("https://login.microsoftonline.com/{domain}/v2.0/.well-known/openid-configuration");
    let client = reqwest::Client::builder().timeout(Duration::from_secs(6)).build().map_err(|e| e.to_string())?;
    let resp = client.get(url).send().await.map_err(|_| "Geen verbinding met Microsoft".to_string())?;
    if !resp.status().is_success() {
        return Err("Tenant niet gevonden".into());
    }
    let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    json.get("issuer")
        .and_then(|v| v.as_str())
        .and_then(parse_issuer)
        .ok_or_else(|| "Tenant niet gevonden".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_issuer() {
        assert_eq!(
            parse_issuer("https://login.microsoftonline.com/00000000-0000-0000-0000-000000000001/v2.0").as_deref(),
            Some("00000000-0000-0000-0000-000000000001")
        );
        assert_eq!(parse_issuer("https://example.com/x"), None);
    }

    #[test]
    fn validates_domains() {
        assert!(valid_domain("contoso.onmicrosoft.com"));
        assert!(!valid_domain("contoso"));
        assert!(!valid_domain("a b.com"));
        assert!(!valid_domain("../x.com"));
    }
}
