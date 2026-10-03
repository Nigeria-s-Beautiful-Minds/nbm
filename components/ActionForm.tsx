"use client";

import { createContext, useActionState, useContext, useEffect, useRef, useState } from "react";
import type { FormState } from "@/lib/forms";

type Action = (state: FormState, formData: FormData) => Promise<FormState>;

const FormContext = createContext<{ state: FormState; pending: boolean }>({ state: { ok: false }, pending: false });

/**
 * A form bound to a server action. Shows the action's success or error message, keeps what the
 * person typed after a recoverable error, and disables the submit button while sending.
 */
export function ActionForm({
  action,
  children,
  submitLabel,
  pendingLabel = "Sending…",
  className = "form-grid",
  buttonClassName = "button",
  hideOnSuccess = false,
  confirm
}: {
  action: Action;
  children?: React.ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  className?: string;
  buttonClassName?: string;
  hideOnSuccess?: boolean;
  confirm?: string;
}) {
  const [state, formAction, pending] = useActionState(action, { ok: false });
  // Stamped in the browser when the form first renders; the server uses it as a bot check.
  const [renderedAt, setRenderedAt] = useState("");
  const statusRef = useRef<HTMLParagraphElement>(null);

  useEffect(() => setRenderedAt(String(Date.now())), [state.nonce]);
  useEffect(() => {
    if (state.nonce) statusRef.current?.focus();
  }, [state.nonce]);

  if (hideOnSuccess && state.ok) {
    return <p className="status success" role="status" tabIndex={-1} ref={statusRef}>{state.message}</p>;
  }

  return (
    <FormContext.Provider value={{ state, pending }}>
      <form
        action={formAction}
        className={className}
        onSubmit={(event) => {
          if (confirm && !window.confirm(confirm)) event.preventDefault();
        }}
      >
        <div className="hp-field" aria-hidden="true">
          <label>Leave this field empty<input type="text" name="nbm_hp" tabIndex={-1} autoComplete="off" /></label>
        </div>
        <input type="hidden" name="nbm_ts" value={renderedAt} />
        {children}
        <div className="full form-actions">
          <button className={buttonClassName} type="submit" disabled={pending}>{pending ? pendingLabel : submitLabel}</button>
        </div>
        {state.ok && state.message && <p className="status success full" role="status" tabIndex={-1} ref={statusRef}>{state.message}</p>}
        {!state.ok && state.error && <p className="status error full" role="alert" tabIndex={-1} ref={statusRef}>{state.error}</p>}
      </form>
    </FormContext.Provider>
  );
}

type FieldProps = {
  name: string;
  label: string;
  type?: "text" | "email" | "password" | "url" | "number" | "date" | "datetime-local" | "textarea" | "select" | "checkbox";
  required?: boolean;
  hint?: string;
  full?: boolean;
  options?: readonly (string | { value: string; label: string })[];
  defaultValue?: string;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
  minLength?: number;
  min?: number;
  autoComplete?: string;
};

export function Field({ name, label, type = "text", required, hint, full = true, options = [], defaultValue = "", placeholder, rows = 4, maxLength, minLength, min, autoComplete }: FieldProps) {
  const { state } = useContext(FormContext);
  const error = state.fieldErrors?.[name];
  // After an error the submitted value comes back from the server; after success the default returns.
  const value = !state.ok && state.values && name in state.values ? state.values[name] : defaultValue;
  const key = `${name}-${state.nonce ?? 0}`;
  const describedBy = [hint ? `${name}-hint` : "", error ? `${name}-error` : ""].filter(Boolean).join(" ") || undefined;
  const common = { id: name, name, required, "aria-invalid": error ? true : undefined, "aria-describedby": describedBy } as const;

  if (type === "checkbox") {
    return (
      <div className={`field-wrap check${full ? " full" : ""}`}>
        <label className="check-label">
          <input key={key} type="checkbox" {...common} defaultChecked={value === "on" || value === "true"} />
          <span>{label}</span>
        </label>
        {hint && <p className="field-hint" id={`${name}-hint`}>{hint}</p>}
        {error && <p className="field-error" id={`${name}-error`}>{error}</p>}
      </div>
    );
  }

  return (
    <div className={`field-wrap${full ? " full" : ""}`}>
      <label htmlFor={name}>{label}{!required && <span className="optional"> (optional)</span>}</label>
      {type === "textarea" ? (
        <textarea key={key} className="field" {...common} rows={rows} maxLength={maxLength} minLength={minLength} placeholder={placeholder} defaultValue={value} />
      ) : type === "select" ? (
        <select key={key} className="field" {...common} defaultValue={value}>
          <option value="">Choose…</option>
          {options.map((option) => {
            const o = typeof option === "string" ? { value: option, label: option } : option;
            return <option key={o.value} value={o.value}>{o.label}</option>;
          })}
        </select>
      ) : (
        <input key={key} className="field" type={type} {...common} maxLength={maxLength} minLength={minLength} min={min} placeholder={placeholder} autoComplete={autoComplete} defaultValue={value} />
      )}
      {hint && <p className="field-hint" id={`${name}-hint`}>{hint}</p>}
      {error && <p className="field-error" id={`${name}-error`}>{error}</p>}
    </div>
  );
}
