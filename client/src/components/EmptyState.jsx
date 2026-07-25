export default function EmptyState({
  icon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryLabel,
  onSecondary,
}) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-state__icon" aria-hidden>{icon}</div>}
      {title && <h2 className="empty-state__title">{title}</h2>}
      {description && <p className="empty-state__desc">{description}</p>}
      {(actionLabel || secondaryLabel) && (
        <div className="empty-state__actions">
          {actionLabel && onAction && (
            <button type="button" className="home-btn home-btn--primary" onClick={onAction}>
              {actionLabel}
            </button>
          )}
          {secondaryLabel && onSecondary && (
            <button type="button" className="home-btn home-btn--ghost" onClick={onSecondary}>
              {secondaryLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
