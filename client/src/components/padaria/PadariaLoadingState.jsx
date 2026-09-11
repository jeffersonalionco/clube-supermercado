export default function PadariaLoadingState({ label = "Carregando…" }) {
  return (
    <div className="pk-state pk-state--loading" role="status" aria-live="polite">
      <div className="pk-skeleton-grid" aria-hidden>
        <div className="pk-skeleton" />
        <div className="pk-skeleton" />
        <div className="pk-skeleton" />
        <div className="pk-skeleton" />
      </div>
      <p className="pk-state__desc">{label}</p>
    </div>
  );
}
