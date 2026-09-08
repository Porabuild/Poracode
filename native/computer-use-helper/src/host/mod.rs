//! Persistent NDJSON host. The input lane serializes state-changing work while
//! the passive lane keeps screenshots and tree reads responsive during input.

pub mod dispatcher;
pub mod writer;

use std::io::{self, BufRead, Write};
use std::sync::Arc;

use serde_json::json;

use crate::backend::Backend;
use crate::protocol::actions::CancelInput;
use crate::protocol::{HelperError, Response, parse_request};
use dispatcher::Dispatcher;
use writer::LineWriter;

fn send(writer: &LineWriter, response: Response) -> bool {
    writer.send(response.to_line())
}

/// Run until stdin closes or the client sends `shutdown`.
pub fn run<R, W>(reader: R, sink: W, backend: Arc<dyn Backend>) -> io::Result<()>
where
    R: BufRead,
    W: Write + Send + 'static,
{
    let (writer, writer_thread) = LineWriter::spawn(sink);
    let mut dispatcher = Dispatcher::new(backend, writer.clone());

    for line in reader.lines() {
        let line = line?;
        let request = match parse_request(&line) {
            Ok(request) => request,
            Err(response) => {
                if !send(&writer, response) {
                    break;
                }
                continue;
            }
        };

        match request.action.as_str() {
            "cancel" => {
                let result = serde_json::from_value::<CancelInput>(request.input)
                    .map(|input| {
                        let cancelled = dispatcher.cancel(input.id);
                        json!({ "id": input.id, "cancelled": cancelled })
                    })
                    .map_err(|error| HelperError::invalid_input(error.to_string()));
                let response = match result {
                    Ok(result) => Response::ok(request.id, result),
                    Err(error) => Response::err(Some(request.id), &error),
                };
                if !send(&writer, response) {
                    break;
                }
            }
            "shutdown" => {
                let _ = send(
                    &writer,
                    Response::ok(request.id, json!({ "shuttingDown": true })),
                );
                break;
            }
            _ => {
                if let Err(error) = dispatcher.submit(request) {
                    let _ = send(&writer, Response::err(error.id, &error.error));
                }
            }
        }
    }

    dispatcher.shutdown();
    drop(writer);
    let _ = writer_thread.join();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::backend::{CancelToken, HelloInfo, InputOptions, KeyboardAction, PointerAction};
    use crate::capture::CaptureResult;
    use crate::protocol::Result;
    use crate::protocol::actions::{
        Capabilities, FindElementsInput, FindElementsResult, InteractiveResult, LaunchResult,
        PermissionState, Permissions,
    };
    use crate::protocol::window::{WindowInfo, WindowRef};
    use std::sync::{Arc, Mutex};

    #[derive(Clone, Default)]
    struct SharedSink(Arc<Mutex<Vec<u8>>>);

    impl Write for SharedSink {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(bytes);
            Ok(bytes.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    struct EmptyBackend;

    impl Backend for EmptyBackend {
        fn hello(&self) -> HelloInfo {
            HelloInfo {
                platform: "test",
                display_server: None,
                capabilities: Capabilities::default(),
                permissions: Permissions {
                    accessibility: PermissionState::NotRequired,
                    screen_recording: PermissionState::NotRequired,
                },
                screen_locked: false,
                notes: vec![],
            }
        }

        fn list_windows(&self) -> Result<Vec<WindowInfo>> {
            Ok(vec![])
        }

        fn resolve_window(&self, _window: &WindowRef) -> Result<WindowInfo> {
            Err(crate::protocol::HelperError::window_unavailable())
        }

        fn capture(&self, _window: &WindowInfo, _cancel: &CancelToken) -> Result<CaptureResult> {
            unreachable!()
        }

        fn find_elements(
            &self,
            _window: &WindowInfo,
            _input: &FindElementsInput,
            _cancel: &CancelToken,
        ) -> Result<FindElementsResult> {
            unreachable!()
        }

        fn activate(&self, _window: &WindowInfo) -> Result<InteractiveResult> {
            unreachable!()
        }

        fn pointer(
            &self,
            _window: &WindowInfo,
            _action: PointerAction,
            _options: InputOptions,
            _cancel: &CancelToken,
        ) -> Result<InteractiveResult> {
            unreachable!()
        }

        fn keyboard(
            &self,
            _window: &WindowInfo,
            _action: KeyboardAction,
            _options: InputOptions,
            _cancel: &CancelToken,
        ) -> Result<InteractiveResult> {
            unreachable!()
        }

        fn launch_app(
            &self,
            _app: &str,
            _mode: crate::protocol::actions::InputMode,
            _cancel: &CancelToken,
        ) -> Result<LaunchResult> {
            unreachable!()
        }
    }

    #[test]
    fn host_answers_malformed_unknown_and_shutdown_requests() {
        let input = concat!(
            "not json\n",
            "{\"id\":1,\"action\":\"unknown\",\"input\":{}}\n",
            "{\"id\":2,\"action\":\"shutdown\",\"input\":{}}\n"
        );
        let sink = SharedSink::default();
        run(input.as_bytes(), sink.clone(), Arc::new(EmptyBackend)).unwrap();
        let output = String::from_utf8(sink.0.lock().unwrap().clone()).unwrap();
        let responses: Vec<serde_json::Value> = output
            .lines()
            .map(|line| serde_json::from_str(line).unwrap())
            .collect();
        assert_eq!(responses.len(), 3);
        let malformed = responses
            .iter()
            .find(|response| response["id"].is_null())
            .unwrap();
        assert_eq!(malformed["code"], "invalid_input");
        let unknown = responses
            .iter()
            .find(|response| response["id"] == 1)
            .unwrap();
        assert_eq!(unknown["code"], "unknown_action");
        let shutdown = responses
            .iter()
            .find(|response| response["id"] == 2)
            .unwrap();
        assert_eq!(shutdown["result"]["shuttingDown"], true);
    }
}
