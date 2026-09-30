import { useEffect, useState } from "react";
import { apiUrl } from "../../../utils/api.js";
import { fetchAdmin, loadAdminSession } from "../../../utils/adminSession.js";

export default function PreviaLink({ url }) {
  const [estado, setEstado] = useState("carregando");
  const [previa, setPrevia] = useState(null);
  const [imagem, setImagem] = useState("");

  useEffect(() => {
    let vivo = true;
    let objeto = "";
    setEstado("carregando");
    setPrevia(null);
    setImagem("");
    fetchAdmin(`/api/admin/marketing/whatsapp/caixa/preview?url=${encodeURIComponent(url)}`)
      .then(async (data) => {
        if (!vivo) return;
        if (!data?.ok) {
          setEstado("vazio");
          return;
        }
        setPrevia(data);
        setEstado("pronta");
        if (!data.temImagem || !data.hash) return;
        const session = loadAdminSession();
        const resposta = await fetch(
          apiUrl(`/api/admin/marketing/whatsapp/caixa/previews/${data.hash}/imagem`),
          { headers: { Authorization: `Bearer ${session?.token || ""}` } }
        );
        if (!resposta.ok || !vivo) return;
        objeto = URL.createObjectURL(await resposta.blob());
        if (vivo) setImagem(objeto);
        else URL.revokeObjectURL(objeto);
      })
      .catch(() => {
        if (vivo) setEstado("vazio");
      });
    return () => {
      vivo = false;
      if (objeto) URL.revokeObjectURL(objeto);
    };
  }, [url]);

  if (estado === "vazio") return null;
  if (estado === "carregando" || !previa) {
    return <div className="wa-caixa__preview wa-caixa__preview--espera" aria-hidden />;
  }

  return (
    <a className="wa-caixa__preview" href={url} target="_blank" rel="noopener noreferrer">
      {imagem ? <img src={imagem} alt="" /> : <span className="wa-caixa__preview-marca" aria-hidden />}
      <span>
        <small>{previa.site}</small>
        {previa.titulo && <strong>{previa.titulo}</strong>}
        {previa.descricao && <em>{previa.descricao}</em>}
      </span>
    </a>
  );
}
