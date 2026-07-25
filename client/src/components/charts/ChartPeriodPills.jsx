const OPCOES = [
  { id: 7, label: "7 dias" },
  { id: 30, label: "30 dias" },
  { id: 90, label: "90 dias" },
];

export default function ChartPeriodPills({ valor, onChange }) {
  return (
    <div className="cchart-pills" role="tablist" aria-label="Período dos gráficos">
      {OPCOES.map((op) => (
        <button
          key={op.id}
          type="button"
          role="tab"
          aria-selected={valor === op.id}
          className={`cchart-pill${valor === op.id ? " cchart-pill--ativo" : ""}`}
          onClick={() => onChange(op.id)}
        >
          {op.label}
        </button>
      ))}
    </div>
  );
}
