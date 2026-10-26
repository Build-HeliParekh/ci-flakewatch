// Quarantine (asks for a reason) or Release when manually quarantined (REQ-UI-07, UI-09).
// When the API needs a write token, the dialog asks for it once per tab (decision PQ-03).
import type { ManualQuarantine } from "@flakewatch/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { ApiClientError } from "../api/client.js";
import { useApiClient } from "../pages/OverviewPage.js";
import { writeToken } from "../state/token.js";

type Mode = { kind: "quarantine" } | { kind: "release" };

export function QuarantineControls({
  testId,
  manual,
}: {
  testId: number;
  manual: ManualQuarantine | null;
}) {
  const api = useApiClient();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<Mode | null>(null);
  const [needsToken, setNeedsToken] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  const refresh = () => queryClient.invalidateQueries();

  const handleFailure = (failure: unknown, mode: Mode) => {
    if (failure instanceof ApiClientError && failure.status === 401) {
      writeToken.clear();
      setNeedsToken(true);
      setDialog(mode);
      setError(needsToken ? "That token was not accepted." : null);
      return;
    }
    setError(failure instanceof Error ? failure.message : "Something went wrong.");
  };

  const quarantine = useMutation({
    mutationFn: (reason: string) => api.quarantine(testId, { reason }, writeToken.get()),
    onSuccess: async () => {
      close();
      await refresh();
    },
    onError: (failure) => handleFailure(failure, { kind: "quarantine" }),
  });

  const release = useMutation({
    mutationFn: () => api.release(testId, writeToken.get()),
    onSuccess: async () => {
      close();
      await refresh();
    },
    onError: (failure) => handleFailure(failure, { kind: "release" }),
  });

  function close() {
    setDialog(null);
    setError(null);
    trigger.current?.focus();
  }

  return (
    <div className="quarantine">
      {manual && (
        <p className="quarantine__note">
          Quarantined by hand on {manual.at.slice(0, 10)}: <q>{manual.reason}</q>
        </p>
      )}
      {/* One button for both actions, so keyboard focus stays on it when the state flips. */}
      <button
        ref={trigger}
        type="button"
        className={manual ? "button" : "button button--primary"}
        disabled={release.isPending}
        onClick={() => (manual ? release.mutate() : setDialog({ kind: "quarantine" }))}
      >
        {manual ? (release.isPending ? "Releasing…" : "Release") : "Quarantine"}
      </button>
      {!dialog && error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      {dialog && (
        <QuarantineDialog
          mode={dialog}
          needsToken={needsToken}
          error={error}
          pending={quarantine.isPending || release.isPending}
          onCancel={close}
          onSubmit={(reason, token) => {
            if (token !== undefined) writeToken.set(token);
            setError(null);
            if (dialog.kind === "quarantine") quarantine.mutate(reason);
            else release.mutate();
          }}
        />
      )}
    </div>
  );
}

function QuarantineDialog({
  mode,
  needsToken,
  error,
  pending,
  onCancel,
  onSubmit,
}: {
  mode: Mode;
  needsToken: boolean;
  error: string | null;
  pending: boolean;
  onCancel(): void;
  onSubmit(reason: string, token: string | undefined): void;
}) {
  const titleId = useId();
  const reasonId = useId();
  const tokenId = useId();
  const box = useRef<HTMLDivElement>(null);
  const [reason, setReason] = useState("");
  const [token, setToken] = useState("");
  const [invalid, setInvalid] = useState<string | null>(null);

  useEffect(() => {
    const first = box.current?.querySelector<HTMLElement>("textarea, input");
    first?.focus();
  }, [needsToken]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (mode.kind === "quarantine") {
      const trimmed = reason.trim();
      if (trimmed === "") return setInvalid("Enter a reason.");
      if (Array.from(trimmed).length > 500) return setInvalid("Keep the reason to 500 characters.");
    }
    if (needsToken && token.trim() === "") return setInvalid("Enter the write token.");
    setInvalid(null);
    onSubmit(reason.trim(), needsToken ? token.trim() : undefined);
  };

  // Keep Tab inside the dialog; Escape cancels.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "Escape") {
      event.preventDefault();
      onCancel();
      return;
    }
    if (event.key !== "Tab" || !box.current) return;
    const focusable = [
      ...box.current.querySelectorAll<HTMLElement>("textarea, input, button:not([disabled])"),
    ];
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };

  const title = mode.kind === "quarantine" ? "Quarantine this test" : "Release this test";
  const message = invalid ?? error;
  return (
    <div className="dialog-backdrop">
      <div
        ref={box}
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onKeyDown={onKeyDown}
      >
        <h2 className="dialog__title" id={titleId}>
          {title}
        </h2>
        <form onSubmit={submit} noValidate>
          {mode.kind === "quarantine" && (
            <>
              <label className="field__label" htmlFor={reasonId}>
                Reason
              </label>
              <p className="field__hint">
                CI won&apos;t block on this test while it&apos;s quarantined. Say why, for whoever
                fixes it.
              </p>
              <textarea
                id={reasonId}
                className="field__input"
                rows={3}
                maxLength={500}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </>
          )}
          {needsToken && (
            <>
              <label className="field__label" htmlFor={tokenId}>
                Write token
              </label>
              <p className="field__hint">
                This flakewatch needs its write token for changes. It&apos;s kept only until you
                close this tab.
              </p>
              <input
                id={tokenId}
                className="field__input"
                type="password"
                autoComplete="off"
                value={token}
                onChange={(e) => setToken(e.target.value)}
              />
            </>
          )}
          {message && (
            <p className="form-error" role="alert">
              {message}
            </p>
          )}
          <div className="dialog__actions">
            <button type="button" className="button button--quiet" onClick={onCancel}>
              Cancel
            </button>
            <button type="submit" className="button button--primary" disabled={pending}>
              {pending
                ? "Saving…"
                : mode.kind === "quarantine"
                  ? "Quarantine test"
                  : "Release test"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
