export default function AceiteLegal({
  checked,
  onChange,
  onAbrirRegulamento,
  onAbrirPrivacidade,
  erro = false,
}) {
  return (
    <label className={`auth-aceite ${erro ? "auth-aceite--error" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        Li e aceito o{" "}
        <button
          type="button"
          className="auth-aceite__link"
          onClick={(e) => {
            e.preventDefault();
            onAbrirRegulamento?.();
          }}
        >
          Regulamento do Clube
        </button>{" "}
        e a{" "}
        <button
          type="button"
          className="auth-aceite__link"
          onClick={(e) => {
            e.preventDefault();
            onAbrirPrivacidade?.();
          }}
        >
          Política de Privacidade
        </button>
        .
      </span>
    </label>
  );
}
