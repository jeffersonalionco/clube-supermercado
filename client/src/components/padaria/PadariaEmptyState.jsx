export default function PadariaEmptyState({
  title = "Nada por aqui",
  description,
  action,
  icon: Icon,
}) {
  return (
    <div className="pk-state pk-state--empty" role="status">
      {Icon ? (
        <div className="pk-state__icon" aria-hidden>
          <Icon size={36} strokeWidth={1.4} />
        </div>
      ) : null}
      <p className="pk-state__title">{title}</p>
      {description ? <p className="pk-state__desc">{description}</p> : null}
      {action ? <div className="pk-state__action">{action}</div> : null}
    </div>
  );
}
