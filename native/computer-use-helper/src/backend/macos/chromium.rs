//! Recognition of Chromium-shell applications.
//!
//! A Chromium shell behaves differently from an ordinary Cocoa app in two ways
//! that both the snapshot path and the input path depend on: it keeps its web
//! content out of the accessibility tree until an assistive client asks for it,
//! and it ignores process-targeted CoreGraphics mouse events. Getting the test
//! wrong is not a cosmetic problem — an unrecognized shell reports background
//! coordinate input as delivered while the app quietly drops it, and exposes no
//! web elements to use instead, which leaves an agent with nothing but window
//! activation and foreground takeover.
//!
//! Recognition is therefore structural rather than a list of browser names.
//! Every Chromium distribution — Chrome, Brave, Edge, Vivaldi, Opera, Arc, any
//! rebranded fork, and every Electron app — ships the crashpad helper inside or
//! beside its main framework, because it is inherited from the Chromium build
//! rather than chosen by the vendor:
//!
//! ```text
//! Brave Browser.app/Contents/Frameworks/Brave Browser Framework.framework/Helpers/chrome_crashpad_handler
//! Poracode.app/Contents/Frameworks/Electron Framework.framework/Versions/A/Helpers/chrome_crashpad_handler
//! ```
//!
//! A name list would have to be extended for every new browser and would miss
//! forks entirely; the crashpad helper needs no maintenance.

use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::{Mutex, OnceLock};

use crate::protocol::window::WindowInfo;

/// Words that mark a Chromium shell when its bundle cannot be inspected.
/// [`WindowInfo::app`] is normally an `.app` path, but it degrades to the
/// executable path or the CoreGraphics owner name, and neither has a bundle to
/// read. Matched per word so `Arc` is recognized while `Monarch` is not.
const CHROMIUM_NAME_WORDS: &[&str] = &[
    "chrome", "chromium", "edge", "brave", "vivaldi", "opera", "arc", "electron",
];

/// The Chromium crash reporter, shipped by every Chromium and Electron build.
const CRASHPAD_HELPER: &str = "chrome_crashpad_handler";

/// Electron places its renderer helper next to the framework instead of inside
/// it, so the bundle scan accepts either shape.
const RENDERER_HELPER_SUFFIX: &str = "Helper (Renderer).app";

fn cache() -> &'static Mutex<HashMap<String, bool>> {
    static CACHE: OnceLock<Mutex<HashMap<String, bool>>> = OnceLock::new();
    CACHE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// True when the window belongs to a Chromium-based browser or an Electron app.
///
/// The bundle layout is read once per application path; every action after the
/// first answers from the cache.
pub fn is_chromium_shell(window: &WindowInfo) -> bool {
    let app = window.app.as_str();
    if app.is_empty() {
        return false;
    }
    if let Some(known) = cache()
        .lock()
        .ok()
        .and_then(|cache| cache.get(app).copied())
    {
        return known;
    }
    // The name list is a fallback, not a supplement: a bundle this host could
    // read has already answered the question, and treating the name as an extra
    // vote misclassifies an ordinary app whose name happens to split into a
    // browser word (`Arc Welder.app`), which would then have its background
    // input refused and a process-wide accessibility mode written into it.
    match bundle_is_chromium(Path::new(app)) {
        Ok(Some(detected)) => {
            if let Ok(mut cache) = cache().lock() {
                cache.insert(app.to_string(), detected);
            }
            detected
        }
        // No bundle: the name is the stable answer, so it is worth caching.
        Ok(None) => {
            let detected = name_suggests_chromium(app);
            if let Ok(mut cache) = cache().lock() {
                cache.insert(app.to_string(), detected);
            }
            detected
        }
        // An unreadable bundle has no answer yet. The name still has to serve
        // this call, but caching it would make a transient read failure a
        // permanent misclassification — a shell the host then lets background
        // coordinate input vanish on.
        Err(()) => name_suggests_chromium(app),
    }
}

/// `Err(())` when there is a bundle but it could not be inspected — a read
/// error is a transient condition (an ACL, an update swapping files), not an
/// answer, so the caller must neither treat it as "not a shell" nor cache it.
/// `Ok(None)` when there is no bundle to inspect — the path is an executable
/// or a CoreGraphics owner name rather than an `.app` — which is the only case
/// the name fallback is a stable answer for.
///
/// The test is `Contents`, not `Contents/Frameworks`: most small Cocoa apps
/// ship no frameworks at all, and treating their absence as "could not read"
/// hands those apps to the name list, where an ordinary app whose name happens
/// to contain a browser word is classified as a browser.
fn bundle_is_chromium(bundle: &Path) -> Result<Option<bool>, ()> {
    // `is_dir` cannot distinguish "no bundle" from "cannot stat the bundle
    // root" (another user's home, a TCC-protected folder), and the distinction
    // is the whole answer: one is a stable non-answer worth caching, the other
    // is a transient failure that must reach the caller uncached.
    match fs::metadata(bundle.join("Contents")) {
        Ok(metadata) if metadata.is_dir() => {}
        Ok(_) => return Ok(None),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(_) => return Err(()),
    }
    let entries = match fs::read_dir(bundle.join("Contents/Frameworks")) {
        Ok(entries) => entries,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(Some(false)),
        Err(_) => return Err(()),
    };
    Ok(Some(entries.flatten().any(|entry| {
        let path = entry.path();
        let name = path
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or("");
        name.ends_with(RENDERER_HELPER_SUFFIX)
            || (name.ends_with(".framework") && framework_ships_crashpad(&path))
    })))
}

fn framework_ships_crashpad(framework: &Path) -> bool {
    // `Helpers` is normally a symlink to the current version's directory. A
    // bundle whose top-level symlinks were stripped still has the real copy
    // under its version directory, so fall back to those.
    if framework.join("Helpers").join(CRASHPAD_HELPER).exists() {
        return true;
    }
    let Ok(versions) = fs::read_dir(framework.join("Versions")) else {
        return false;
    };
    versions.flatten().any(|version| {
        version
            .path()
            .join("Helpers")
            .join(CRASHPAD_HELPER)
            .exists()
    })
}

fn name_suggests_chromium(app: &str) -> bool {
    let name = Path::new(app)
        .file_stem()
        .and_then(|stem| stem.to_str())
        .unwrap_or(app)
        .to_ascii_lowercase();
    name.split(|character: char| !character.is_ascii_alphanumeric())
        .any(|word| CHROMIUM_NAME_WORDS.contains(&word))
}

#[cfg(test)]
mod tests {
    use super::{bundle_is_chromium, is_chromium_shell, name_suggests_chromium};
    use crate::protocol::window::WindowInfo;
    use std::fs;
    use std::path::{Path, PathBuf};
    use tempfile::TempDir;

    fn bundle(root: &Path, name: &str) -> PathBuf {
        let bundle = root.join(name);
        fs::create_dir_all(bundle.join("Contents/Frameworks")).unwrap();
        bundle
    }

    fn temp_root(_name: &str) -> TempDir {
        tempfile::tempdir().expect("temp dir")
    }

    fn chromium_bundle(root: &Path, name: &str) -> PathBuf {
        let app = bundle(root, name);
        let helpers = app
            .join("Contents/Frameworks")
            .join(format!(
                "{} Framework.framework",
                name.trim_end_matches(".app")
            ))
            .join("Helpers");
        fs::create_dir_all(&helpers).unwrap();
        fs::write(helpers.join("chrome_crashpad_handler"), b"").unwrap();
        app
    }

    fn window(app: &Path) -> WindowInfo {
        WindowInfo {
            app: app.to_string_lossy().into_owned(),
            id: 1,
            title: "Window".into(),
            x: 0,
            y: 0,
            width: 100,
            height: 100,
            pid: Some(2),
            display_name: None,
            minimized: None,
            source: None,
        }
    }

    /// A rebranded Chromium browser keeps the crashpad helper inside its own
    /// renamed framework, which is why recognition cannot rely on the name.
    /// The public entry point, including its cache: a second call must answer
    /// the same way, and an empty app path is not a Chromium shell.
    #[test]
    fn answers_and_caches_the_public_query() {
        let root = temp_root("public");
        let app = chromium_bundle(root.path(), "Public Browser.app");
        let target = window(&app);

        assert!(is_chromium_shell(&target));
        assert!(is_chromium_shell(&target), "second call answers from cache");

        let plain = bundle(root.path(), "Plain.app");
        assert!(!is_chromium_shell(&window(&plain)));
        assert!(!is_chromium_shell(&WindowInfo {
            app: String::new(),
            ..window(&plain)
        }));
    }

    #[test]
    fn recognizes_a_rebranded_chromium_browser() {
        let root = temp_root("rebranded");
        let root = root.path();
        let app = bundle(root, "Fictional Browser.app");
        let helpers = app.join("Contents/Frameworks/Fictional Browser Framework.framework/Helpers");
        fs::create_dir_all(&helpers).unwrap();
        fs::write(helpers.join("chrome_crashpad_handler"), b"").unwrap();

        assert_eq!(bundle_is_chromium(&app), Ok(Some(true)));
        assert!(!name_suggests_chromium(app.to_str().unwrap()));
    }

    /// Electron keeps the helper under the framework's version directory and
    /// its renderer helper beside the framework.
    #[test]
    fn recognizes_an_electron_app() {
        let root = temp_root("electron");
        let root = root.path();
        let app = bundle(root, "Some Tool.app");
        let helpers =
            app.join("Contents/Frameworks/Electron Framework.framework/Versions/A/Helpers");
        fs::create_dir_all(&helpers).unwrap();
        fs::write(helpers.join("chrome_crashpad_handler"), b"").unwrap();

        assert_eq!(bundle_is_chromium(&app), Ok(Some(true)));

        let renamed = bundle(root, "Renamed.app");
        fs::create_dir_all(renamed.join("Contents/Frameworks/Renamed Helper (Renderer).app"))
            .unwrap();
        assert_eq!(bundle_is_chromium(&renamed), Ok(Some(true)));
    }

    #[test]
    fn leaves_an_ordinary_cocoa_app_alone() {
        let root = temp_root("cocoa");
        let root = root.path();
        let app = bundle(root, "Notes.app");
        fs::create_dir_all(app.join("Contents/Frameworks/Sparkle.framework/Versions/A")).unwrap();

        assert_eq!(bundle_is_chromium(&app), Ok(Some(false)));
        assert_eq!(
            bundle_is_chromium(&root.join("Missing.app")),
            Ok(None),
            "no bundle to read is not the same as a bundle that is not Chromium"
        );
    }

    /// Most small Cocoa apps ship no frameworks. Reading that as "could not
    /// inspect" would hand them to the name list, where an app named after a
    /// browser word is classified as a browser — its background input refused
    /// and a process-wide accessibility mode written into it.
    #[test]
    fn an_app_without_frameworks_is_still_an_answer() {
        let root = temp_root("frameworkless");
        let plain = root.path().join("Arc Welder.app");
        fs::create_dir_all(plain.join("Contents/MacOS")).unwrap();

        assert_eq!(bundle_is_chromium(&plain), Ok(Some(false)));
        assert!(
            name_suggests_chromium(plain.to_str().unwrap()),
            "the name alone would have misclassified it"
        );
        assert!(!is_chromium_shell(&window(&plain)));
    }

    /// The name fallback only runs for windows whose bundle cannot be read, so
    /// it has to match whole words rather than substrings.
    #[test]
    fn falls_back_to_whole_words_in_the_application_name() {
        for app in [
            "/Applications/Brave Browser.app",
            "/Applications/Google Chrome.app",
            "/Applications/Microsoft Edge.app",
            "/Applications/Arc.app",
            "Vivaldi",
        ] {
            assert!(name_suggests_chromium(app), "{app}");
        }
        for app in [
            "/Applications/Monarch.app",
            "/Applications/Operations.app",
            "/System/Applications/Safari.app",
            "",
        ] {
            assert!(!name_suggests_chromium(app), "{app}");
        }
    }

    /// A read error is not an answer: an app whose Frameworks directory could
    /// not be listed once (an ACL, an update swapping files) must not be
    /// remembered as a non-shell, or background coordinate input on it would be
    /// reported as delivered while the app quietly drops it — permanently.
    #[test]
    fn an_unreadable_bundle_is_not_cached_as_an_answer() {
        let root = temp_root("unreadable");
        let app = chromium_bundle(root.path(), "Flaky Browser.app");
        let frameworks = app.join("Contents/Frameworks");
        {
            use std::os::unix::fs::PermissionsExt;
            let mut permissions = fs::metadata(&frameworks).unwrap().permissions();
            permissions.set_mode(0o000);
            fs::set_permissions(&frameworks, permissions).unwrap();
        }

        assert_eq!(bundle_is_chromium(&app), Err(()));
        assert!(
            !is_chromium_shell(&window(&app)),
            "the name fallback serves the call while the bundle is unreadable"
        );

        {
            use std::os::unix::fs::PermissionsExt;
            let mut permissions = fs::metadata(&frameworks).unwrap().permissions();
            permissions.set_mode(0o755);
            fs::set_permissions(&frameworks, permissions).unwrap();
        }
        assert!(
            is_chromium_shell(&window(&app)),
            "the unreadable call must not have cached an answer"
        );
    }
}
