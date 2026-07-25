import "../styles/metaji-credit.css";

const METAJI_URL = "https://metaji.com.br/contact-us/";

export default function MetajiCredit({ className = "" }) {
  const classes = ["metaji-credit", className].filter(Boolean).join(" ");

  return (
    <p className={classes}>
      Desenvolvido por{" "}
      <a href={METAJI_URL} target="_blank" rel="noopener noreferrer">
        Metaji Soluções
      </a>
    </p>
  );
}
