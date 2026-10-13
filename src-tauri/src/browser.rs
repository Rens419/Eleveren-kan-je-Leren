//! Opens portal URLs in the browser (and profile) the user picked.

use std::path::PathBuf;
use std::process::Command;

/// Display name or directory name → profile directory, from a Chromium `Local State` file.
pub fn find_profile_dir(local_state: &str, wanted: &str) -> Option<String> {
    let json: serde_json::Value = serde_json::from_str(local_state).ok()?;
    let cache = json.get("profile")?.get("info_cache")?.as_object()?;
    let wanted = wanted.trim();
    if cache.contains_key(wanted) {
        return Some(wanted.to_string());
    }
    cache
        .iter()
        .find(|(_, v)| v.get("name").and_then(|n| n.as_str()).is_some_and(|n| n.eq_ignore_ascii_case(wanted)))
        .map(|(dir, _)| dir.clone())
}

pub fn profiles(local_state: &str) -> Vec<(String, String)> {
    let Ok(json) = serde_json::from_str::<serde_json::Value>(local_state) else { return vec![] };
    let Some(cache) = json.get("profile").and_then(|p| p.get("info_cache")).and_then(|c| c.as_object()) else { return vec![] };
    let mut v: Vec<_> = cache
        .iter()
        .map(|(dir, info)| (dir.clone(), info.get("name").and_then(|n| n.as_str()).unwrap_or(dir).to_string()))
        .collect();
    v.sort_by(|a, b| a.1.to_lowercase().cmp(&b.1.to_lowercase()));
    v
}

#[cfg(target_os = "macos")]
fn app_name(browser: &str) -> Option<&'static str> {
    match browser {
        "edge" => Some("Microsoft Edge"),
        "chrome" => Some("Google Chrome"),
        "brave" => Some("Brave Browser"),
        "safari" => Some("Safari"),
        "firefox" => Some("Firefox"),
        _ => None,
    }
}

fn local_state_path(browser: &str) -> Option<PathBuf> {
    let sub = match browser {
        "edge" => "Microsoft Edge",
        "chrome" => "Google/Chrome",
        "brave" => "BraveSoftware/Brave-Browser",
        _ => return None,
    };
    let home = std::env::var_os("HOME")?;
    Some(PathBuf::from(home).join("Library/Application Support").join(sub).join("Local State"))
}

pub fn list_profiles(browser: &str) -> Vec<(String, String)> {
    local_state_path(browser).and_then(|p| std::fs::read_to_string(p).ok()).map(|s| profiles(&s)).unwrap_or_default()
}

pub fn open(url: &str, browser: &str, profile: &str) -> Result<(), String> {
    if !(url.starts_with("https://") || url.starts_with("http://")) {
        return Err("Alleen http(s)-links kunnen worden geopend".into());
    }
    #[cfg(target_os = "macos")]
    {
        let mut cmd = Command::new("open");
        match app_name(browser) {
            None => {
                cmd.arg(url);
            }
            Some(app) => {
                let chromium = matches!(browser, "edge" | "chrome" | "brave");
                let profile = profile.trim();
                if chromium && !profile.is_empty() {
                    let dir = local_state_path(browser)
                        .and_then(|p| std::fs::read_to_string(p).ok())
                        .and_then(|s| find_profile_dir(&s, profile))
                        .unwrap_or_else(|| profile.to_string());
                    cmd.args(["-na", app, "--args"]).arg(format!("--profile-directory={dir}")).arg(url);
                } else {
                    cmd.args(["-a", app]).arg(url);
                }
            }
        }
        let status = cmd.status().map_err(|e| format!("Kan browser niet starten: {e}"))?;
        if status.success() {
            Ok(())
        } else {
            Err("De gekozen browser kon niet worden geopend. Staat hij geïnstalleerd?".into())
        }
    }
    #[cfg(not(target_os = "macos"))]
    {
        let _ = (browser, profile);
        let _ = Command::new("true");
        Err("Browser openen is nog niet beschikbaar op dit platform".into())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const STATE: &str = r#"{"profile":{"info_cache":{"Default":{"name":"Persoonlijk"},"Profile 1":{"name":"Werk"}}}}"#;

    #[test]
    fn maps_display_name_to_directory() {
        assert_eq!(find_profile_dir(STATE, "werk").as_deref(), Some("Profile 1"));
        assert_eq!(find_profile_dir(STATE, "Default").as_deref(), Some("Default"));
        assert_eq!(find_profile_dir(STATE, "Onbekend"), None);
    }

    #[test]
    fn lists_profiles_sorted_by_name() {
        let p = profiles(STATE);
        assert_eq!(p[0].1, "Persoonlijk");
        assert_eq!(p[1], ("Profile 1".to_string(), "Werk".to_string()));
    }

    #[test]
    fn refuses_non_http_urls() {
        assert!(open("file:///etc/passwd", "default", "").is_err());
        assert!(open("javascript:alert(1)", "default", "").is_err());
    }
}
