"use client";
import { useEffect, useRef, useState } from "react";
import { Bug, Globe, Lightbulb, Paperclip, Search, X } from "lucide-react";
import Image from "next/image";
import { put } from "@vercel/blob/client";
import {
  deliverFeedback,
  FeedbackDeliveryError,
  type FeedbackDelivery,
} from "../../../src/shared/feedbackClient";
function AttachmentPreview({ file }: { file: File }) {
  const previewRoot = useRef<HTMLDetailsElement>(null);
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const image = /^(png|jpe?g|webp|gif)$/.test(extension);
  const video = /^(mp4|webm)$/.test(extension);
  useEffect(() => {
    const preview = URL.createObjectURL(
      new Blob([file], {
        type: image ? "image/" + (extension === "jpg" ? "jpeg" : extension) : "video/" + extension,
      }),
    );
    previewRoot.current
      ?.querySelectorAll<HTMLImageElement | HTMLVideoElement>("img, video")
      .forEach((element) => {
        element.src = preview;
      });
    return () => URL.revokeObjectURL(preview);
  }, [file, image, extension]);
  return (
    <details ref={previewRoot} className="min-w-0 flex-1">
      <summary className="flex cursor-pointer items-center gap-2.5">
        <span className="flex h-8 w-10 shrink-0 items-center justify-center overflow-hidden rounded bg-[#101015]">
          {image ? (
            <Image
              src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
              alt=""
              width={40}
              height={32}
              unoptimized
              className="h-full w-full object-cover"
            />
          ) : (
            <Paperclip size={14} className="text-[#9090a1]" />
          )}
        </span>
        <span className="min-w-0">
          <strong className="block truncate text-xs font-medium">{file.name}</strong>
          <small className="text-[10px] text-[#9090a1]">{Math.ceil(file.size / 1024)} KB</small>
        </span>
      </summary>
      {image ? (
        <Image
          src="data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs="
          alt={file.name}
          width={500}
          height={300}
          unoptimized
          className="mt-2 max-h-64 max-w-full object-contain"
        />
      ) : video ? (
        <video controls muted className="mt-2 max-h-64 max-w-full" />
      ) : null}
    </details>
  );
}
export function FeedbackForm() {
  const [kind, setKind] = useState<"bug" | "idea">("bug");
  const [title, setTitle] = useState("");
  const [details, setDetails] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [diagnostics, setDiagnostics] = useState(true);
  const [preview, setPreview] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [ready, setReady] = useState(false);
  const delivery = useRef<FeedbackDelivery | null>(null);
  const [hasDelivery, setHasDelivery] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const environment = typeof navigator === "undefined" ? "" : navigator.userAgent;
  useEffect(() => {
    let disposed = false;
    void fetch("/api/feedback")
      .then((r) => r.json())
      .then((config) => {
        if (disposed) return;
        if (!config.enabled) {
          setMessage("Feedback is temporarily unavailable. Please try again later.");
          return;
        }
        setReady(true);
      })
      .catch(() => setMessage("Feedback could not load. Please try again later."));
    return () => {
      disposed = true;
    };
  }, []);
  function add(selected: File[]) {
    if (busy || delivery.current) return;
    const next = [...files, ...selected];
    if (
      next.length > 5 ||
      next.some(
        (f) =>
          f.size < 1 || f.size > 10_000_000 || !/\.(png|jpe?g|webp|gif|mp4|webm)$/i.test(f.name),
      )
    ) {
      setMessage("Choose up to 5 supported files, 10 MB each.");
      return;
    }
    setFiles(next);
    if (ready) setMessage("");
  }
  async function send() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await deliverFeedback({
        base: "",
        draft: { kind, title, details, diagnostics: diagnostics ? environment : "" },
        files,
        delivery: delivery.current,
        onDelivery: (value) => {
          delivery.current = value;
          setHasDelivery(true);
        },
        onProgress: (progress) =>
          setMessage(
            progress === "prepare"
              ? "Preparing your report…"
              : progress === "complete"
                ? "Finishing your report on GitHub…"
                : `Uploading attachment ${progress.upload}…`,
          ),
        upload: (grant, file) =>
          put(grant.path, file, { access: "private", token: grant.token, contentType: grant.type }),
      });
      if ("pending" in result) {
        setMessage("Still processing. Send again to check the same report.");
        return;
      }
      setUrl(result.url);
      setFiles([]);
      setTitle("");
      setDetails("");
      delivery.current = null;
      setHasDelivery(false);
    } catch (error) {
      if (error instanceof FeedbackDeliveryError && error.code === "expired") {
        delivery.current = null;
        setHasDelivery(false);
      }
      setMessage(
        error instanceof FeedbackDeliveryError
          ? error.code === "expired"
            ? "This submission has expired. Your draft is kept."
            : "The report could not be confirmed yet. Please retry."
          : error instanceof Error
            ? error.message
            : "Feedback could not be sent. Your draft is kept.",
      );
    } finally {
      setBusy(false);
    }
  }
  if (url)
    return (
      <section className="space-y-4 py-10">
        <h2 className="text-xl font-semibold">Feedback sent</h2>
        <p>
          Your report and attachments are now on GitHub. Keep the link to follow the discussion.
        </p>
        <a href={url} target="_blank" rel="noreferrer" className="underline">
          View GitHub issue
        </a>
      </section>
    );
  const locked = busy || hasDelivery;
  const field =
    "w-full rounded-lg border border-[#464652] bg-[#1a1a21] px-2.5 py-2 text-[13px] text-[#eeeef3] outline-none focus:border-[#9292b4] focus:ring-1 focus:ring-[#9292b4]";
  return (
    <form
      className="flex flex-col gap-3 text-[13px] leading-5 text-[#eeeef3] [&_button]:transition-colors [&_button]:disabled:cursor-default [&_button]:focus-visible:outline-2 [&_button]:focus-visible:outline-offset-2 [&_button]:focus-visible:outline-[#9292b4]"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <p className="text-[#a8a8b5]">Report a bug or suggest an idea.</p>
      <div className="flex gap-1.5">
        {(["bug", "idea"] as const).map((value) => (
          <button
            key={value}
            type="button"
            disabled={locked}
            aria-pressed={kind === value}
            onClick={() => setKind(value)}
            className={`flex items-center gap-2 rounded-[7px] border px-3 py-1.5 ${kind === value ? "border-[#626272] bg-[#3a3a46] text-[#f2f2f6]" : "border-[#43434e] text-[#a6a6b4] hover:bg-[#30303a]"}`}
          >
            {value === "bug" ? <Bug size={16} /> : <Lightbulb size={16} />}
            {value === "bug" ? "Bug" : "Idea"}
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1.5 text-xs text-[#c8c8d2]">
        <span>Title</span>
        <input
          className={field}
          required
          minLength={5}
          maxLength={160}
          value={title}
          disabled={locked}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-xs text-[#c8c8d2]">
        <span>{kind === "bug" ? "What happened?" : "What would you like to see?"}</span>
        <textarea
          className={`${field} min-h-24 resize-y leading-5`}
          required
          minLength={20}
          maxLength={5000}
          value={details}
          disabled={locked}
          onChange={(e) => setDetails(e.target.value)}
          onPaste={(event) => {
            const pasted = Array.from(event.clipboardData.files);
            if (pasted.length) {
              event.preventDefault();
              add(pasted);
            }
          }}
        />
      </label>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2 text-xs text-[#c8c8d2]">
          <span>
            Attachments <span className="ml-1 text-[11px] text-[#9090a1]">(optional)</span>
          </span>
          <span className="text-[11px] text-[#9090a1]">5 files · 10 MB each</span>
        </div>
        {files.map((file, index) => (
          <div
            key={`${file.name}:${file.lastModified}:${file.size}:${index}`}
            className="flex items-start gap-2 rounded-[7px] bg-[#1a1a21] px-2.5 py-2"
          >
            <AttachmentPreview file={file} />
            <button
              disabled={locked}
              type="button"
              aria-label={`Remove ${file.name}`}
              className="mt-1 grid size-6 shrink-0 place-items-center rounded text-[#a6a6b4] hover:bg-[#30303a] hover:text-white"
              onClick={() => setFiles(files.filter((_, i) => i !== index))}
            >
              <X size={16} />
            </button>
          </div>
        ))}
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept=".png,.jpg,.jpeg,.webp,.gif,.mp4,.webm"
          onChange={(e) => {
            add(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
        <button
          type="button"
          disabled={locked}
          onClick={() => input.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            add(Array.from(event.dataTransfer.files));
          }}
          onPaste={(event) => {
            const pasted = Array.from(event.clipboardData.files);
            if (pasted.length) {
              event.preventDefault();
              add(pasted);
            }
          }}
          className="flex w-full items-center justify-center gap-2 rounded-[7px] border border-dashed border-[#50505d] px-2 py-2 text-xs text-[#b4b4c3] hover:bg-[#30303a]"
        >
          <Paperclip size={16} />
          Add files, drop here, or paste an image
        </button>
      </div>
      <div className="mt-1 space-y-1.5 border-t border-[#3b3b48] pt-3">
        <div className="flex items-center justify-between gap-2 text-xs">
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={diagnostics}
              disabled={locked}
              onChange={(e) => setDiagnostics(e.target.checked)}
              className="size-3.5 accent-[#b8b8cd]"
            />
            Include basic diagnostics
          </label>
          <button
            type="button"
            className="text-[11px] text-[#b4b4c3] underline hover:text-white"
            onClick={() => setPreview(!preview)}
          >
            Preview
          </button>
        </div>
        <p className="text-[11px] leading-4 text-[#9292a4]">
          Browser and platform only. No chat history is attached automatically.
        </p>
        {preview && <p className="break-all text-xs">{environment}</p>}
      </div>
      <p className="flex items-start gap-2 text-[11px] leading-4 text-[#b0b0c0]">
        <Globe size={14} className="mt-px shrink-0" />
        <span>
          <strong className="font-medium text-[#dedee7]">Public on GitHub.</strong> Your report and
          attachments will be visible to everyone.
        </span>
      </p>
      <p role="status" className="text-xs text-[#c8c8d2] empty:hidden">
        {message}
      </p>
      <div className="flex items-center justify-between gap-2 pt-1">
        <a
          href="https://github.com/Porabuild/Poracode/issues"

          target="_blank"
          rel="noreferrer"
          className="mr-auto flex items-center gap-1.5 text-[11px] text-[#a9a9bd] hover:text-white"
        >
          <Search size={13} />
          Existing issues
        </a>

        <button
          disabled={busy || !ready}
          type="submit"
          className="rounded-[7px] border border-[#626272] bg-[#444451] px-4 py-2 text-xs font-semibold hover:bg-[#50505f] disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </form>
  );
}
