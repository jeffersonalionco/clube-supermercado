export default function Field({
  label,
  hint,
  error,
  children,
  id,
}) {
  return (
    <label className="auth-field" htmlFor={id}>
      <span className="auth-field__label">{label}</span>
      <div className={`auth-field__control ${error ? "auth-field__control--error" : ""}`}>
        {children}
      </div>
      {hint && <small className="auth-field__hint">{hint}</small>}
      {error && <small className="auth-field__error">{error}</small>}
    </label>
  );
}
