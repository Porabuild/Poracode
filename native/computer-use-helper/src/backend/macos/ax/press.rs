//! Turning a coordinate or a request into an acted-on element, and observing
//! the result.

use std::thread;
use std::time::{Duration, Instant};

use objc2_core_foundation::CGPoint;

use super::chromium;
use super::snapshot::{ATTR_POSITION, batched_ax_value, build_snapshot, node_attributes};
use super::webcontent::request_web_accessibility;
use super::{
    AX_SUCCESS, AX_VALUE_POINT, AXUIElementCopyElementAtPosition, AxElement, application,
    belongs_to_window, copy_attribute, ensure_trusted, perform, string_attribute, window_id,
};
use crate::backend::CancelToken;
use crate::elements::{SnapshotCache, canonical_role};
use crate::geometry::frame_to_screen;
use crate::protocol::actions::{DeliveryTarget, ElementAction, ElementInfo};
use crate::protocol::window::WindowInfo;
use crate::protocol::{HelperError, Result};

/// Node budget for the tree walk that resolves a coordinate to an element.
/// Matches the default `get_window_state` budget so a click sees the same tree
/// the agent would have inspected.
const TREE_HIT_MAX_NODES: usize = 2000;
/// Budget for an element action's effect to show up in the tree.
/// Longer than the measured 350-460 ms Chromium lag, and `observed` returns
/// as soon as the effect shows, so a synchronous app pays one read.
const EFFECT_OBSERVE_INTERVAL: Duration = Duration::from_millis(25);
const EFFECT_OBSERVE_TIMEOUT: Duration = Duration::from_millis(600);
/// How far up from a target `scroll` looks for something that can scroll.
const SCROLL_ANCESTOR_LIMIT: usize = 8;
/// A press candidate may cover at most this fraction of the window frame.
/// Anything larger is a pane rather than a control.
const PRESS_AREA_DIVISOR: i64 = 4;

/// Watch for an element action's effect, tolerating a lagging report.
///
/// The outcome of watching an action's observable effect.
#[derive(Debug, PartialEq, Eq)]
pub(super) enum Observation {
    /// The effect showed up.
    Seen,
    /// The budget elapsed without it. The action was accepted and nothing
    /// happened, which is a real finding.
    Absent,
    /// The watch was abandoned, so nothing was learned either way.
    Interrupted,
}

/// Watch an action's observable effect, polling because an accessibility
/// server answers asynchronously — Chromium keeps returning pre-action values
/// for 350-460 ms after an action it has already carried out — so reading once
/// certifies nothing. A blind evaluation of the previous behavior got it wrong
/// in both directions on the same page: `set_element_value` reported
/// `unchanged` on a write that had landed, and `invoke_element` with `scroll`
/// reported `confirmed` on five no-ops in a row. Returns as soon as the effect
/// shows, so a synchronous app pays nothing.
pub(super) fn observed(cancel: &CancelToken, mut effect: impl FnMut() -> bool) -> Observation {
    let deadline = Instant::now() + EFFECT_OBSERVE_TIMEOUT;
    loop {
        if effect() {
            return Observation::Seen;
        }
        // A batch of element actions can queue dozens of these, and every one
        // of them holds the input lane. Without this check the host's `cancel`
        // and the Escape abort would both wait out the whole run. It is
        // reported apart from a real timeout: an interrupted watch saw nothing
        // *and learned nothing*, and telling the agent "nothing happened" would
        // send it to press something else after this action already landed.
        if cancel.is_cancelled() {
            return Observation::Interrupted;
        }
        if Instant::now() >= deadline {
            return Observation::Absent;
        }
        thread::sleep(EFFECT_OBSERVE_INTERVAL);
    }
}

/// Reveal an element by scrolling it into view, and report what actually moved.
///
/// `AXScrollToVisible` is not exposed where an agent naturally asks for it. In a
/// browser list the action sits on a row's anonymous wrapper, while the node an
/// agent can search for by text is the leaf inside it — which refuses — and the
/// scroll container above accepts the call and moves nothing. Three independent
/// blind evaluations all dead-ended on exactly that shape. Walking up from the
/// target fixes it without guesswork: the first ancestor that accepts the
/// request contains the target, so revealing it reveals the target.
pub(super) fn scroll_into_view(element: &AxElement, window: &WindowInfo) -> Option<Scrolled> {
    let mut current = element.clone();
    for _ in 0..SCROLL_ANCESTOR_LIMIT {
        // Sampled before the request, not after it: a scroll that has already
        // happened cannot be told apart from one that never did by comparing
        // against a reading taken afterwards.
        let before = element_origin(&current);
        if perform(&current, "AXScrollToVisible") {
            return Some(Scrolled {
                element: current,
                before,
            });
        }
        let parent = copy_attribute(&current, "AXParent").map(AxElement::from_cf)?;
        if !belongs_to_window(&parent, window) {
            return None;
        }
        current = parent;
    }
    None
}

/// The element `scroll_into_view` acted on, and where it sat beforehand.
pub(super) struct Scrolled {
    pub element: AxElement,
    pub before: Option<(i32, i32)>,
}

/// The element's own frame, used to tell a real scroll from a no-op.
pub(super) fn element_origin(element: &AxElement) -> Option<(i32, i32)> {
    let values = node_attributes(element);
    batched_ax_value::<CGPoint>(&values, ATTR_POSITION, AX_VALUE_POINT)
        .map(|point| (point.x.round() as i32, point.y.round() as i32))
}

/// A pressed coordinate, and how the element under it was found.
pub(crate) struct PressedTarget {
    pub(crate) target: DeliveryTarget,
    /// True when the app's own hit test was unusable and the window's tree
    /// resolved the coordinate instead. Reported so the caller can say which
    /// element it pressed rather than implying a real pointer event.
    pub(crate) resolved_by_tree: bool,
}

fn contains_point(element: &ElementInfo, x: f64, y: f64) -> bool {
    x >= f64::from(element.bounds.x)
        && y >= f64::from(element.bounds.y)
        && x < f64::from(element.bounds.x + element.bounds.width)
        && y < f64::from(element.bounds.y + element.bounds.height)
}

/// Pick the element a click at this frame point should press.
///
/// The deepest candidate wins, with area breaking ties: nested elements all
/// contain the point, and the deepest is the most specific control rather than
/// the pane holding it.
///
/// Two guards keep this from pressing something the user could not have hit.
/// A candidate covering most of the window is a pane, not a control — dead
/// space inside a pressable container would otherwise press the container —
/// and a candidate with no area is a node the app has collapsed, which is how
/// a browser reports rows scrolled out of their list.
fn press_candidate(elements: &[ElementInfo], window: &WindowInfo, x: f64, y: f64) -> Option<usize> {
    let window_area = i64::from(window.width.max(1)) * i64::from(window.height.max(1));
    let area_limit = window_area / PRESS_AREA_DIVISOR;
    elements
        .iter()
        .enumerate()
        .filter(|(_, element)| {
            let area = i64::from(element.bounds.width) * i64::from(element.bounds.height);
            element.enabled
                && !element.offscreen
                && element.bounds.width > 1
                && element.bounds.height > 1
                && area <= area_limit
                && element.actions.contains(&ElementAction::Invoke)
                && contains_point(element, x, y)
        })
        // Deeper is more specific; area breaks ties between siblings.
        .max_by_key(|(_, element)| {
            let area = i64::from(element.bounds.width) * i64::from(element.bounds.height);
            (element.depth, -area)
        })
        .map(|(index, _)| index)
}

fn press_target(element: &AxElement, id: String) -> DeliveryTarget {
    DeliveryTarget {
        kind: "ax".into(),
        id,
        role: string_attribute(element, "AXRole").map(|role| canonical_role(&role)),
        name: string_attribute(element, "AXTitle")
            .or_else(|| string_attribute(element, "AXDescription")),
    }
}

/// The element the app itself reports under a screen point, when it is usable.
///
/// `None` covers both "the call failed" and "the app answered with something
/// outside this window", which is how a Chromium window answers every point.
fn hit_test(application: &AxElement, window: &WindowInfo, screen: (i32, i32)) -> Option<AxElement> {
    let mut hit = std::ptr::null_mut();
    // SAFETY: The application is live and `hit` is a writable Create-rule output.
    let status = unsafe {
        AXUIElementCopyElementAtPosition(
            application.as_ptr(),
            f64::from(screen.0),
            f64::from(screen.1),
            &mut hit,
        )
    };
    if status != AX_SUCCESS {
        return None;
    }
    AxElement::from_created(hit).filter(|element| belongs_to_window(element, window))
}

/// Press the accessibility element under a frame coordinate.
///
/// The app's own hit test comes first and settles the common case: it knows the
/// z-order, so it answers with the control the user would actually have hit,
/// and if that control exposes no press action then the point is not on a
/// control and this returns `None` without building anything.
///
/// The tree route exists only for Chromium, whose hit test is unusable.
/// Measured on Brave 152, every point in a Chromium window — tab strip,
/// toolbar, page — answers with the application menu bar, so without a second
/// route a coordinate click on a browser is refused while the control under it
/// is perfectly pressable. That route cannot see z-order, so any other app
/// whose hit test fails falls through to a real pointer event instead.
pub(crate) fn press_at_position(
    cache: &SnapshotCache<AxElement>,
    window: &WindowInfo,
    frame_x: f64,
    frame_y: f64,
    cancel: &CancelToken,
) -> Result<Option<PressedTarget>> {
    ensure_trusted()?;
    let pid = window.pid.ok_or_else(HelperError::window_unavailable)?;
    let application = application(pid)?;
    // A coordinate click can be the first thing an agent does to a browser, with
    // no snapshot before it, so ask for the page before either route looks for
    // an element in it.
    if chromium::is_chromium_shell(window) {
        request_web_accessibility(pid, &application);
    }
    let screen = frame_to_screen(window, frame_x, frame_y);
    if let Some(element) = hit_test(&application, window, screen) {
        if !perform(&element, "AXPress") {
            return Ok(None);
        }
        let id = window_id(&element)
            .map(|id| id.to_string())
            .unwrap_or_else(|| "position".into());
        return Ok(Some(PressedTarget {
            target: press_target(&element, id),
            resolved_by_tree: false,
        }));
    }
    // The tree cannot see z-order. A sheet, popover, or overlapping sibling
    // would let this press a control the screenshot showed covered — the same
    // class of wrong-action as a right click becoming a left press. Chromium
    // never answers hit tests and drops process-targeted events, so the tree
    // is the only background route there. Everywhere else an unusable hit
    // test means the point is not on a control, and the caller posts a real
    // pointer event that sees z-order.
    if !chromium::is_chromium_shell(window) {
        return Ok(None);
    }
    let snapshot = build_snapshot(window, TREE_HIT_MAX_NODES, cancel)?;
    let Some(index) = press_candidate(&snapshot.elements, window, frame_x, frame_y) else {
        return Ok(None);
    };
    if !perform(&snapshot.handles[index], "AXPress") {
        return Ok(None);
    }
    let target = press_target(
        &snapshot.handles[index],
        snapshot.elements[index].id.clone(),
    );
    // The reported id has to be one the caller can act on next, so the tree
    // that produced it joins the cache the same way an inspection tree would.
    // Without this the click would name an element id that every following
    // invoke_element rejects as a stale snapshot.
    cache.insert(snapshot);
    Ok(Some(PressedTarget {
        target,
        resolved_by_tree: true,
    }))
}

#[cfg(test)]
mod tests {
    use super::{EFFECT_OBSERVE_TIMEOUT, Observation, observed, press_candidate};
    use crate::backend::CancelToken;
    use crate::protocol::actions::{ElementAction, ElementBounds, ElementInfo};
    use crate::protocol::window::WindowInfo;
    use std::time::Instant;

    fn pressable(x: i32, y: i32, width: i32, height: i32) -> ElementInfo {
        ElementInfo {
            id: String::new(),
            role: "button".into(),
            name: None,
            value: None,
            automation_id: None,
            bounds: ElementBounds {
                x,
                y,
                width,
                height,
            },
            enabled: true,
            focused: false,
            offscreen: false,
            actions: vec![ElementAction::Invoke],
            depth: 1,
        }
    }

    fn hit_window() -> WindowInfo {
        WindowInfo {
            app: "/Applications/Some.app".into(),
            id: 1,
            title: "Some".into(),
            x: 0,
            y: 0,
            width: 1000,
            height: 800,
            pid: Some(2),
            display_name: None,
            minimized: None,
            source: None,
        }
    }

    /// A batch of element actions queues one of these per step, each holding
    /// the input lane, so the abort has to reach inside the loop.
    #[test]
    fn observation_stops_when_the_request_is_cancelled() {
        let cancel = CancelToken::default();
        cancel.cancel();
        let start = Instant::now();
        let mut polls = 0;

        let seen = observed(&cancel, || {
            polls += 1;
            false
        });

        // Interrupted, not Absent: an abandoned watch learned nothing, and
        // reporting it as "nothing happened" would tell the agent to press
        // something else after this action already landed.
        assert!(matches!(seen, Observation::Interrupted));
        assert_eq!(polls, 1, "the effect is checked once before giving up");
        assert!(
            start.elapsed() < EFFECT_OBSERVE_TIMEOUT,
            "returned early instead of waiting out the budget"
        );
    }

    /// Chromium answers every hit test with the same element, so a coordinate
    /// has to be resolved against the tree. Nested nodes all contain the point;
    /// the specific control is the deepest of them, not the pane holding it.
    #[test]
    fn resolves_a_coordinate_to_the_deepest_pressable_element() {
        let window = hit_window();
        let elements = vec![
            ElementInfo {
                depth: 1,
                ..pressable(100, 80, 200, 40)
            },
            ElementInfo {
                depth: 2,
                ..pressable(110, 90, 20, 20)
            },
        ];

        assert_eq!(press_candidate(&elements, &window, 115.0, 95.0), Some(1));
        // Inside the panel but outside the button: the panel is the control.
        assert_eq!(press_candidate(&elements, &window, 250.0, 100.0), Some(0));
        assert_eq!(press_candidate(&elements, &window, 1200.0, 100.0), None);
    }

    /// A pane is not a control. Pressing one because the point landed on its
    /// dead space would fire something the user never could have clicked, and
    /// the tree route cannot see that a real click would have hit nothing.
    #[test]
    fn refuses_to_press_a_pane_sized_element() {
        let window = hit_window();
        let pane = vec![pressable(0, 0, 1000, 800)];

        assert_eq!(press_candidate(&pane, &window, 900.0, 700.0), None);
    }

    /// A browser reports rows scrolled out of their list at the clip edge with
    /// no height, and every such row contains the same point.
    #[test]
    fn refuses_to_press_an_element_with_no_area() {
        let window = hit_window();
        let collapsed = vec![pressable(39, 664, 55, 1)];

        assert_eq!(press_candidate(&collapsed, &window, 50.0, 664.0), None);
    }

    #[test]
    fn prefers_the_smaller_of_two_overlapping_siblings() {
        let window = hit_window();
        let elements = vec![
            ElementInfo {
                depth: 3,
                ..pressable(0, 0, 200, 200)
            },
            ElementInfo {
                depth: 3,
                ..pressable(0, 0, 40, 40)
            },
        ];

        assert_eq!(press_candidate(&elements, &window, 10.0, 10.0), Some(1));
    }

    #[test]
    fn refuses_to_press_something_the_user_cannot_click() {
        let window = hit_window();
        let disabled = ElementInfo {
            enabled: false,
            ..pressable(0, 0, 100, 100)
        };
        let offscreen = ElementInfo {
            offscreen: true,
            ..pressable(0, 0, 100, 100)
        };
        let inert = ElementInfo {
            actions: Vec::new(),
            ..pressable(0, 0, 100, 100)
        };

        for elements in [vec![disabled], vec![offscreen], vec![inert]] {
            assert_eq!(press_candidate(&elements, &window, 10.0, 10.0), None);
        }
    }
}
