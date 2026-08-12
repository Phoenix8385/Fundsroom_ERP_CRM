import type { ReactNode } from 'react';
import { useId } from 'react';

interface FieldProps {
  label: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: (props: { id: string; describedBy: string | undefined; invalid: boolean }) => ReactNode;
}

/**
 * Labels a control and wires its error text through aria-describedby, so the
 * validation message is announced rather than only shown.
 */
export function Field({ label, error, hint, required, children }: FieldProps) {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;

  return (
    <div className={`field${error ? ' field--invalid' : ''}`}>
      <label className="field__label" htmlFor={id}>
        {label}
        {required ? <span className="field__required" aria-hidden="true"> *</span> : null}
      </label>
      {children({ id, describedBy: message ? messageId : undefined, invalid: Boolean(error) })}
      {message ? (
        <p className={`field__message${error ? ' field__message--error' : ''}`} id={messageId}>
          {message}
        </p>
      ) : null}
    </div>
  );
}

interface TextInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  type?: 'text' | 'email' | 'password' | 'number' | 'date' | 'tel';
  placeholder?: string;
  autoFocus?: boolean;
  disabled?: boolean;
  min?: number;
  step?: string;
}

export function TextInput({
  label,
  value,
  onChange,
  error,
  hint,
  required,
  type = 'text',
  placeholder,
  autoFocus,
  disabled,
  min,
  step,
}: TextInputProps) {
  return (
    <Field label={label} error={error} hint={hint} required={required}>
      {({ id, describedBy, invalid }) => (
        <input
          id={id}
          className="input"
          type={type}
          value={value}
          placeholder={placeholder}
          autoFocus={autoFocus}
          disabled={disabled}
          min={min}
          step={step}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}

interface SelectInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
}

export function SelectInput({
  label,
  value,
  onChange,
  options,
  error,
  hint,
  required,
  disabled,
}: SelectInputProps) {
  return (
    <Field label={label} error={error} hint={hint} required={required}>
      {({ id, describedBy, invalid }) => (
        <select
          id={id}
          className="input"
          value={value}
          disabled={disabled}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.value)}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  error,
  rows = 3,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  rows?: number;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <Field label={label} error={error} required={required}>
      {({ id, describedBy, invalid }) => (
        <textarea
          id={id}
          className="input"
          rows={rows}
          value={value}
          placeholder={placeholder}
          aria-describedby={describedBy}
          aria-invalid={invalid || undefined}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}

/** Form-level failure banner, for the message the server sent back. */
export function FormError({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <p className="form-error" role="alert">
      {message}
    </p>
  );
}
