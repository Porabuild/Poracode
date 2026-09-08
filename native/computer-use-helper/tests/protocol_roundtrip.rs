use std::io::Write as _;
use std::process::{Command, Stdio};

use poracode_computer_use::protocol::actions::{ElementAction, RefusalCode};

fn helper() -> Command {
    Command::new(env!("CARGO_BIN_EXE_poracode-computer-use"))
}

#[test]
fn replays_protocol_v1_fixture() {
    let fixture = include_bytes!("../fixtures/protocol-v1.ndjson");
    let expected: Vec<serde_json::Value> =
        serde_json::from_str(include_str!("../fixtures/protocol-v1.expected.json")).unwrap();

    let mut child = helper()
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .expect("spawn helper");
    child.stdin.take().unwrap().write_all(fixture).unwrap();
    let output = child.wait_with_output().unwrap();
    assert!(
        output.status.success(),
        "{}",
        String::from_utf8_lossy(&output.stderr)
    );

    let actual: Vec<serde_json::Value> = String::from_utf8(output.stdout)
        .unwrap()
        .lines()
        .map(|line| serde_json::from_str(line).unwrap())
        .collect();
    assert_eq!(actual.len(), expected.len());
    for expected in expected {
        let actual = actual
            .iter()
            .find(|actual| actual["id"] == expected["id"])
            .expect("response for fixture id");
        assert_eq!(actual["id"], expected["id"]);
        assert_eq!(actual["ok"], expected["ok"]);
        if let Some(code) = expected.get("code") {
            assert_eq!(&actual["code"], code);
        }
        if let Some(protocol) = expected.pointer("/result/protocolVersion") {
            assert_eq!(&actual["result"]["protocolVersion"], protocol);
        }
        if let Some(shutting_down) = expected.pointer("/result/shuttingDown") {
            assert_eq!(&actual["result"]["shuttingDown"], shutting_down);
        }
    }
}

#[test]
fn hello_flag_emits_bare_handshake() {
    let output = helper().arg("--hello").output().expect("run --hello");
    assert!(output.status.success());
    let hello: serde_json::Value = serde_json::from_slice(&output.stdout).unwrap();
    assert_eq!(
        hello["protocolVersion"],
        poracode_computer_use::protocol::version::PROTOCOL_VERSION
    );
    assert!(hello["helperVersion"].is_string());
    assert!(hello["platform"].is_string());
    assert!(hello["capabilities"].is_object());
}

#[test]
fn preserves_window_unavailable_recovery_text() {
    assert_eq!(
        poracode_computer_use::protocol::HelperError::window_unavailable().to_string(),
        "Window is no longer available. Call list_windows or get_window for a fresh id and retry."
    );
}

/// A refused background action must offer background routes and nothing else.
///
/// A blind evaluation showed why: after an agent had tried every route a hint
/// listed, `mode:"foreground"` was the only unused string left in it, and the
/// agent read that as the sanctioned next step. Hints therefore name background
/// routes and then defer to the user.
/// Every hint the helper ships, on every platform. The first version of this
/// test only covered the shared constants, and two Windows-specific hints kept
/// offering `mode:"foreground"` as the next step for months of review.
#[test]
fn no_shipped_refusal_hint_offers_a_takeover() {
    let sources = [
        include_str!("../src/protocol/actions.rs"),
        include_str!("../src/host/dispatcher.rs"),
        include_str!("../src/backend/windows/security.rs"),
        include_str!("../src/backend/windows/input.rs"),
        include_str!("../src/backend/windows/mod.rs"),
        include_str!("../src/backend/macos/mod.rs"),
        include_str!("../src/backend/macos/input.rs"),
        include_str!("../src/backend/macos/session.rs"),
        include_str!("../src/backend/macos/ax/mod.rs"),
        include_str!("../src/backend/macos/ax/press.rs"),
        include_str!("../src/backend/macos/ax/snapshot.rs"),
        include_str!("../src/backend/macos/ax/webcontent.rs"),
        include_str!("../src/backend/linux/mod.rs"),
        include_str!("../src/backend/linux/atspi.rs"),
        include_str!("../src/backend/linux/x11/input.rs"),
        include_str!("../src/backend/mod.rs"),
        include_str!("../src/backend/windows/uia.rs"),
    ];
    for source in sources {
        for line in source.lines() {
            let line = line.trim();
            // Hints are the third argument of `Refusal::new` and the bodies of
            // the `*_HINT` constants. Naming the takeover in either is the
            // licence a blind evaluation treated as the next step.
            if line.starts_with("//") {
                continue;
            }
            let is_hint =
                line.contains("HINT") || line.contains("hint:") || line.contains("Refusal::new");
            if !is_hint {
                continue;
            }
            assert!(
                !line.contains("foreground") && !line.contains("activate_window"),
                "a refusal hint still offers a takeover as the next step: {line}"
            );
        }
    }
}

#[test]
fn refusal_hints_offer_background_routes_and_never_a_takeover() {
    use poracode_computer_use::protocol::actions::Refusal;
    for hint in [
        Refusal::background_unavailable("test").hint,
        Refusal::window_minimized().hint,
        Refusal::ELEMENT_SCROLL_HINT.to_string(),
        Refusal::CONTEXT_MENU_HINT.to_string(),
    ] {
        assert!(hint.contains("element"), "names an element route: {hint}");
        for planted in ["foreground", "activate_window"] {
            assert!(!hint.contains(planted), "{planted} must not appear: {hint}");
        }
    }
}

/// Every multi-word input field parses its canonical wire name.
///
/// Casing and synonym tolerance lives in one place only: the TypeScript host's
/// `ARG_ALIASES` normalizes an agent's spelling before send and rejects a
/// conflicting pair by name. The wire takes canonical names only, so the two
/// tables cannot drift the way a second Rust-side alias list would.
#[test]
fn parses_the_canonical_input_fields() {
    use poracode_computer_use::protocol::actions::{
        ClickInput, ElementAction, FindElementsInput, GetWindowStateInput, InvokeElementInput,
        MouseButton, ScrollInput,
    };
    let window = r#""window":{"app":"a","id":1}"#;

    let input: InvokeElementInput = serde_json::from_str(&format!(
        r#"{{{window},"element_id":"s1:2","action":"scroll"}}"#
    ))
    .expect("invoke_element");
    assert_eq!(input.element_id, "s1:2");
    assert_eq!(input.action, ElementAction::Scroll);

    let input: ScrollInput = serde_json::from_str(&format!(
        "{{{window},\"x\":0,\"y\":0,\"scrollX\":1,\"scrollY\":2}}"
    ))
    .expect("scroll");
    assert_eq!((input.scroll_x, input.scroll_y), (1.0, 2.0));

    let input: GetWindowStateInput =
        serde_json::from_str(&format!(r#"{{{window},"include_text":true}}"#)).expect("state");
    assert!(input.wants_text());

    let input: FindElementsInput =
        serde_json::from_str(&format!(r#"{{{window},"max_results":7}}"#)).expect("find");
    assert_eq!(input.max_results(), 7);

    let input: ClickInput = serde_json::from_str(&format!(
        r#"{{{window},"x":1,"y":1,"mouse_button":"right"}}"#
    ))
    .expect("click");
    assert_eq!(input.button().unwrap(), MouseButton::Right);
}

#[test]
fn wire_enum_fixture_matches_rust() {
    let fixture: serde_json::Value =
        serde_json::from_str(include_str!("../fixtures/protocol-v1.enums.json")).unwrap();
    let element_actions = [
        ElementAction::Invoke,
        ElementAction::Toggle,
        ElementAction::Select,
        ElementAction::Expand,
        ElementAction::Collapse,
        ElementAction::SetValue,
        ElementAction::Scroll,
        ElementAction::ContextMenu,
        ElementAction::Click,
    ];
    let invocable_actions = element_actions
        .into_iter()
        .filter(|action| *action != ElementAction::SetValue)
        .collect::<Vec<_>>();
    let refusal_codes = [
        RefusalCode::BackgroundUnavailable,
        RefusalCode::BackgroundOccludedUnsupported,
        RefusalCode::WaylandRawInputUnsupported,
        RefusalCode::WindowMinimized,
        RefusalCode::ElevatedTarget,
        RefusalCode::SecureDesktop,
        RefusalCode::TargetNotResponding,
        RefusalCode::DecorationTarget,
        RefusalCode::PermissionDenied,
        RefusalCode::StaleSnapshot,
        RefusalCode::ElementActionUnsupported,
        RefusalCode::UnsupportedButton,
        RefusalCode::CapabilityUnavailable,
        RefusalCode::ScreenLocked,
    ];

    assert_eq!(
        serde_json::to_value(element_actions).unwrap(),
        fixture["elementActions"]
    );
    assert_eq!(
        serde_json::to_value(invocable_actions).unwrap(),
        fixture["invocableElementActions"]
    );
    assert_eq!(
        serde_json::to_value(refusal_codes).unwrap(),
        fixture["refusalCodes"]
    );
}
