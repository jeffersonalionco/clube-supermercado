export default function ProgressBar({
  value = 0,
  max = 100,
  label,
  hint,
  variant = "default",
  animated = true,
}) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  return (
    <div className={`progress-bar progress-bar--${variant}`}>
      {(label || hint) && (
        <div className="progress-bar__header">
          {label && <span className="progress-bar__label">{label}</span>}
          {hint && <span className="progress-bar__hint">{hint}</span>}
        </div>
      )}
      <div
        className="progress-bar__track"
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={`progress-bar__fill${animated ? " progress-bar__fill--animated" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
