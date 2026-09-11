export default function PadariaErrorState({
  title = "Não foi possível carregar",
  description = "Tente novamente em instantes.",
  onRetry,
  retryLabel = "Tentar novamente",
}) {
  return (
    <div className="pk-state pk-state--error" role="alert">
      <p className="pk-state__title">{title}</p>
      {description ? <p className="pk-state__desc">{description}</p> : null}
      {onRetry ? (
        <div className="pk-state__action">
          <button
            type="button"
            className="padaria-btn padaria-btn--primary padaria-btn--sm"
            onClick={onRetry}
          >
            {retryLabel}
          </button>
        </div>
      ) : null}
    </div>
  );
}
