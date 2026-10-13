//! Background ticker for the locally tracked PIM activations: expiry warnings, expiry
//! and the delayed "open portal when active".

use crate::commands::open_portal_inner;
use crate::state::{now, Shared};
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

const WARN_BEFORE_SECS: i64 = 10 * 60;

#[derive(Debug, PartialEq)]
pub enum Action {
    OpenPortal { customer: String, portal: String },
    Warn { customer: String },
}

/// Pure step of the ticker: mutates the timers and says what to do. Kept free of Tauri so it can be tested.
pub fn step(settings: &mut crate::state::Settings, at: i64) -> (Vec<Action>, bool) {
    let mut actions = vec![];
    let mut changed = false;
    let notify = settings.notify;
    let mut expired = vec![];
    for (id, t) in settings.timers.iter_mut() {
        if let (Some(open_at), Some(portal)) = (t.open_at, t.open_portal.clone()) {
            if at >= open_at && at < t.ends_at {
                actions.push(Action::OpenPortal { customer: id.clone(), portal });
                t.open_at = None;
                t.open_portal = None;
                changed = true;
            }
        }
        if !t.warned && t.ends_at > at && t.ends_at - at <= WARN_BEFORE_SECS {
            t.warned = true;
            changed = true;
            if notify {
                actions.push(Action::Warn { customer: id.clone() });
            }
        }
        if t.ends_at <= at {
            expired.push(id.clone());
        }
    }
    for id in expired {
        settings.timers.remove(&id);
        changed = true;
    }
    (actions, changed)
}

pub fn spawn(app: AppHandle) {
    std::thread::spawn(move || loop {
        std::thread::sleep(Duration::from_secs(15));
        tick(&app);
    });
}

fn tick(app: &AppHandle) {
    let shared = app.state::<Shared>();
    let (actions, changed, names) = {
        let mut s = shared.lock().unwrap();
        let (actions, changed) = step(&mut s.settings, now());
        if changed {
            let _ = s.save_settings();
        }
        let names: std::collections::HashMap<String, String> =
            s.config.customers.iter().map(|c| (c.id.clone(), c.name.clone())).collect();
        (actions, changed, names)
    };
    for a in actions {
        match a {
            Action::OpenPortal { customer, portal } => {
                let _ = open_portal_inner(app, &customer, &portal);
            }
            Action::Warn { customer } => {
                let name = names.get(&customer).cloned().unwrap_or(customer);
                let _ = app
                    .notification()
                    .builder()
                    .title("PIM loopt bijna af")
                    .body(format!("{name}: nog ongeveer 10 minuten"))
                    .show();
            }
        }
    }
    if changed {
        let _ = app.emit("state-changed", ());
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::state::{Settings, Timer};

    fn timer(ends_at: i64) -> Timer {
        Timer { started_at: 0, ends_at, ticket: "1".into(), duration_minutes: 60, warned: false, open_portal: Some("m365".into()), open_at: Some(180) }
    }

    #[test]
    fn opens_portal_once_after_delay() {
        let mut s = Settings::default();
        s.timers.insert("c".into(), timer(4000));
        assert!(step(&mut s, 100).0.is_empty());
        let (a, changed) = step(&mut s, 200);
        assert_eq!(a, vec![Action::OpenPortal { customer: "c".into(), portal: "m365".into() }]);
        assert!(changed);
        assert!(step(&mut s, 300).0.is_empty());
    }

    #[test]
    fn warns_once_ten_minutes_before_end_and_removes_expired() {
        let mut s = Settings::default();
        let mut t = timer(2000);
        t.open_at = None;
        t.open_portal = None;
        s.timers.insert("c".into(), t);
        assert!(step(&mut s, 1000).0.is_empty());
        assert_eq!(step(&mut s, 1500).0, vec![Action::Warn { customer: "c".into() }]);
        assert!(step(&mut s, 1600).0.is_empty());
        let (_, changed) = step(&mut s, 2001);
        assert!(changed && s.timers.is_empty());
    }

    #[test]
    fn no_warning_when_notifications_are_off() {
        let mut s = Settings::default();
        s.notify = false;
        let mut t = timer(2000);
        t.open_at = None;
        s.timers.insert("c".into(), t);
        assert!(step(&mut s, 1500).0.is_empty());
        assert!(s.timers["c"].warned);
    }
}
