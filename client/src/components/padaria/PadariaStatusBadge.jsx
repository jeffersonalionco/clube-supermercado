import { labelStatusPedido } from "../../utils/padariaFormat.js";

export default function PadariaStatusBadge({ status, className = "" }) {
  const key = String(status || "").trim();
  return (
    <span
      className={`pk-status pk-status--${key} ${className}`.trim()}
      title={labelStatusPedido(key)}
    >
      {labelStatusPedido(key)}
    </span>
  );
}
