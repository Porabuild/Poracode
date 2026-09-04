//! Single stdout writer. Workers hand over fully serialized lines so the
//! writer only performs I/O; the bounded channel applies back-pressure when
//! the parent stalls instead of growing memory without bound.

use std::io::Write;
use std::thread::JoinHandle;

use crossbeam_channel::{Receiver, Sender, bounded};

pub const WRITER_QUEUE_CAPACITY: usize = 16;

#[derive(Clone)]
pub struct LineWriter {
    tx: Sender<Vec<u8>>,
}

impl LineWriter {
    pub fn spawn<W: Write + Send + 'static>(mut sink: W) -> (Self, JoinHandle<()>) {
        let (tx, rx): (Sender<Vec<u8>>, Receiver<Vec<u8>>) = bounded(WRITER_QUEUE_CAPACITY);
        let handle = std::thread::Builder::new()
            .name("stdout-writer".into())
            .spawn(move || {
                for line in rx {
                    if sink.write_all(&line).is_err() || sink.flush().is_err() {
                        // Parent went away; nothing else to do.
                        break;
                    }
                }
            })
            .expect("spawn writer thread");
        (Self { tx }, handle)
    }

    /// Queue one line. Returns false once the writer is gone.
    pub fn send(&self, line: Vec<u8>) -> bool {
        self.tx.send(line).is_ok()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::{Arc, Mutex};

    #[derive(Clone, Default)]
    struct SharedSink(Arc<Mutex<Vec<u8>>>);

    impl Write for SharedSink {
        fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(buf);
            Ok(buf.len())
        }

        fn flush(&mut self) -> std::io::Result<()> {
            Ok(())
        }
    }

    #[test]
    fn preserves_line_boundaries_under_concurrent_producers() {
        let sink = SharedSink::default();
        let (writer, handle) = LineWriter::spawn(sink.clone());
        let mut threads = Vec::new();
        for producer in 0..8u32 {
            let writer = writer.clone();
            threads.push(std::thread::spawn(move || {
                for i in 0..50u32 {
                    let line = format!("{{\"p\":{producer},\"i\":{i}}}\n").into_bytes();
                    assert!(writer.send(line));
                }
            }));
        }
        for thread in threads {
            thread.join().unwrap();
        }
        drop(writer);
        handle.join().unwrap();
        let text = String::from_utf8(sink.0.lock().unwrap().clone()).unwrap();
        let lines: Vec<&str> = text.lines().collect();
        assert_eq!(lines.len(), 400);
        for line in lines {
            serde_json::from_str::<serde_json::Value>(line).expect("each line is complete JSON");
        }
    }
}
