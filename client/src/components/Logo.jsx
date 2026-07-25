import logoImg from "../assets/logo.png";

export default function Logo({ variant = "default", className = "" }) {
  return (
    <div className={`app-logo-wrap app-logo-wrap--${variant} ${className}`.trim()}>
      <img
        src={logoImg}
        alt="Clube Superama+"
        className="app-logo"
        width={variant === "hero" ? 280 : variant === "header" ? 150 : 200}
        height="auto"
        decoding="async"
      />
    </div>
  );
}
