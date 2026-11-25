import Icon from "./Icon.tsx";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
export const when = (value: string) =>
  new Intl.DateTimeFormat("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
export const localTime = (value: string) =>
  new Date(Date.parse(value) + 5.5 * 3_600_000).toISOString().slice(0, 16);
export const istTime = (value: string) => `${value}:00+05:30`;
export function notify(message: string, error = false) {
  window.dispatchEvent(
    new CustomEvent("orderpulse:notice", { detail: { message, error } }),
  );
}
export async function api(path: string, body: unknown = {}, success?: string) {
  try {
    const response = await fetch(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    if (!response.ok)
      throw new Error(result.error ?? "Unable to complete the action.");
    window.dispatchEvent(new Event("orderpulse:refresh"));
    if (success) notify(success);
    return result;
  } catch (e) {
    notify(
      e instanceof Error ? e.message : "Connection lost. Try again.",
      true,
    );
    throw e;
  }
}
export function Notifications() {
  const [notice, setNotice] = useState<{
    message: string;
    error: boolean;
  } | null>(null);
  useEffect(() => {
    const listener = (e: Event) => setNotice((e as CustomEvent).detail);
    window.addEventListener("orderpulse:notice", listener);
    return () => window.removeEventListener("orderpulse:notice", listener);
  }, []);
  useEffect(() => {
    if (!notice || notice.error) return;
    const timer = setTimeout(() => setNotice(null), 7000);
    return () => clearTimeout(timer);
  }, [notice]);
  return (
    notice && (
      <div
        className={`toast ${notice.error ? "toast-error" : ""}`}
        role={notice.error ? "alert" : "status"}
      >
        <span>
          <Icon name={notice.error ? "alert" : "check"} size={18} />
        </span>
        <p>{notice.message}</p>
        <button
          aria-label="Dismiss notification"
          onClick={() => setNotice(null)}
        >
          <Icon name="close" size={16} />
        </button>
      </div>
    )
  );
}
export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty-state">
      <span aria-hidden="true">
        <Icon name="empty" />
      </span>
      <b>{title}</b>
      <p>{text}</p>
    </div>
  );
}
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    ref.current?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      ref.current?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      className="workflow-modal"
      aria-label={title}
      onCancel={(e) => {
        e.preventDefault();
        close.current();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) close.current();
      }}
    >
      <div className="modal-content">
        <div className="panel-heading">
          <h2>{title}</h2>
          <button
            type="button"
            className="secondary-button"
            aria-label={`Close ${title}`}
            onClick={onClose}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
export function SourceLink({
  url,
  children,
}: {
  url: string;
  children?: ReactNode;
}) {
  const safe = /^(https?:\/\/|\/mock\/)/i.test(url);
  return safe ? (
    <a className="source-link" href={url} target="_blank" rel="noreferrer">
      {children ?? url} <Icon name="arrow" size={15} />
    </a>
  ) : (
    <span className="field-help">{children ?? url}</span>
  );
}

export class WorkspaceErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="loading-screen">
        <div className="brand-mark">O</div>
        <h1>Workspace could not load</h1>
        <p>Your saved data is still on the server. Reload to reconnect.</p>
        <button className="primary-button" onClick={() => location.reload()}>
          Reload workspace
        </button>
      </main>
    ) : (
      this.props.children
    );
  }
}
