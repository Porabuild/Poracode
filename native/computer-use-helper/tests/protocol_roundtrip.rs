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
