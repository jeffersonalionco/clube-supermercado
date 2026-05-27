import logoImg from "../assets/logo.png";

export default function Logo({ variant = "default", className = "" }) {
  return (
    <div className={`app-logo-wrap app-logo-wrap--${variant} ${className}`.trim()}>
      <img
        src={logoImg}
        alt="Clube Superama+"
        className="app-logo"
        width={variant === "hero" ? 240 : variant === "header" ? 140 : 180}
        height="auto"
        decoding="async"
      />
    </div>
  );
}
