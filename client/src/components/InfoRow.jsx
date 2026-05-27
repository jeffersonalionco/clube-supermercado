export default function InfoRow({ label, value }) {
  if (!value) return null;
  return (
    <div className="home-info-row">
      <span className="home-info-row__label">{label}</span>
      <span className="home-info-row__value">{value}</span>
    </div>
  );
}
