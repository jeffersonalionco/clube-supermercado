import { useCallback, useEffect, useRef, useState } from "react";
import { IdCard, ShoppingBag } from "lucide-react";
import BolhaWhatsapp from "../../components/admin/wa-caixa/BolhaWhatsapp.jsx";
import CompartilharWhatsapp from "../../components/admin/wa-caixa/CompartilharWhatsapp.jsx";
import PedidoErpWhatsapp from "../../components/admin/wa-caixa/PedidoErpWhatsapp.jsx";
import PedidoWhatsapp from "../../components/admin/wa-caixa/PedidoWhatsapp.jsx";
import CompositorWhatsapp, {
  arquivoCabeNoWhatsapp,
  avisoArquivoGrande,
  mimeLocal,
  tipoLocal,
} from "../../components/admin/wa-caixa/CompositorWhatsapp.jsx";
import { normalizarTelefoneWa } from "../../components/admin/wa-caixa/formatarTextoWhatsapp.js";
import { apiUrl, parseApiResponse } from "../../utils/api.js";
import { clearAdminSession, fetchAdmin, loadAdminSession } from "../../utils/adminSession.js";
import { mensagemParaUsuario } from "../../utils/mensagensUsuario.js";

const FILTROS = [
  { id: "todos", label: "Todos" },
  { id: "clube", label: "Clube" },
  { id: "catalogo", label: "Produto" },
];

const FILTROS_AGENDA = [
  { id: "todos", label: "Todos" },
  { id: "clube", label: "Clube" },
];

/** O pedido no ERP ainda não entra no atendimento. */
const PEDIDO_ERP_VISIVEL = false;

const ROTULO_TIPO = {
  image: "Foto",
  audio: "Áudio",
  video: "Vídeo",
  sticker: "Figurinha",
  document: "Arquivo",
  order: "Pedido",
  catalogo: "Produto",
};

function horaCurta(valor) {
  if (!valor) return "";
  const data = new Date(valor);
  const agora = new Date();
  if (data.toDateString() === agora.toDateString()) {
    return data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

function rotuloDia(valor) {
  const data = new Date(valor);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  if (data.toDateString() === hoje.toDateString()) return "Hoje";
  if (data.toDateString() === ontem.toDateString()) return "Ontem";
  return data.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

function horaPrazo(valor) {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return "";
  const hora = data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (data.toDateString() === new Date().toDateString()) return hora;
  const dia = data.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${dia} ${hora}`;
}

function textoJanela(conversa) {
  if (!conversa?.janelaAberta) return "Janela fechada";
  const hora = horaPrazo(conversa.janelaAte);
  return hora ? `Pode responder até ${hora}` : "Janela aberta";
}

function iniciais(nome) {
  const partes = String(nome || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!partes.length) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return `${partes[0][0]}${partes[partes.length - 1][0]}`.toUpperCase();
}

function resumoLista(item) {
  const prefixo = ROTULO_TIPO[item.ultimoTipo];
  const texto = item.ultimaMensagem || "";
  if (!prefixo) return texto;
  if (texto.startsWith(prefixo)) return texto;
  return texto ? `${prefixo} · ${texto}` : prefixo;
}

function ordemMensagem(mensagem) {
  if (mensagem.pendente) return 1e15 + (mensagem.ordem || 0);
  return Number(mensagem.id) || 0;
}

function juntarMensagens(atual, novas) {
  const mapa = new Map();
  for (const msg of [...atual, ...novas]) mapa.set(msg.id, msg);
  return [...mapa.values()].sort((a, b) => ordemMensagem(a) - ordemMensagem(b));
}

function mimeDeArquivo(arquivo, tipo) {
  const peloNome = mimeLocal(arquivo);
  if (peloNome) return peloNome;
  if (tipo === "image") return "image/jpeg";
  if (tipo === "video") return "video/mp4";
  if (tipo === "audio") return "audio/mpeg";
  return "application/octet-stream";
}

function linhasDoFio(mensagens) {
  const linhas = [];
  let anterior = null;
  for (const msg of mensagens) {
    const dia = new Date(msg.criadoEm).toDateString();
    const diaAnterior = anterior ? new Date(anterior.criadoEm).toDateString() : "";
    if (dia !== diaAnterior) {
      linhas.push({ tipo: "dia", id: `dia-${dia}`, rotulo: rotuloDia(msg.criadoEm) });
    }
    const agrupada = Boolean(
      anterior &&
        anterior.direcao === msg.direcao &&
        anterior.origem === msg.origem &&
        dia === diaAnterior &&
        new Date(msg.criadoEm) - new Date(anterior.criadoEm) < 3 * 60 * 1000
    );
    linhas.push({ tipo: "msg", id: msg.id, msg, agrupada });
    anterior = msg;
  }
  return linhas;
}

export default function AdminWhatsAppCaixaPage({ onVoltar, onLogout }) {
  const [busca, setBusca] = useState("");
  const [filtro, setFiltro] = useState("todos");
  const [conversas, setConversas] = useState([]);
  const [painel, setPainel] = useState("conversas");
  const [contatos, setContatos] = useState([]);
  const [compartilhando, setCompartilhando] = useState(null);
  const [erroCompartilhar, setErroCompartilhar] = useState("");
  const [telefone, setTelefone] = useState("");
  const [conversa, setConversa] = useState(null);
  const [mensagens, setMensagens] = useState([]);
  const [temMais, setTemMais] = useState(false);
  const [buscaFio, setBuscaFio] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [fichaAberta, setFichaAberta] = useState(true);
  const [pedidoAberto, setPedidoAberto] = useState(false);
  const [pedidoErpAberto, setPedidoErpAberto] = useState(false);
  const [sementePedido, setSementePedido] = useState(null);
  const [buscaFioAberta, setBuscaFioAberta] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [avisoFio, setAvisoFio] = useState("");
  const fimRef = useRef(null);
  const listaRef = useRef(null);
  const pertoDoFimRef = useRef(true);
  const rolarAoAbrirRef = useRef(false);
  const carregandoAntigasRef = useRef(false);
  const buscaRef = useRef(busca);
  const filtroRef = useRef(filtro);
  const telefoneRef = useRef(telefone);
  const buscaFioRef = useRef(buscaAplicada);
  const ultimaIdRef = useRef(0);
  const ordemRef = useRef(1);
  const filasRef = useRef(new Map());
  const desdeRef = useRef("");
  const painelRef = useRef(painel);

  buscaRef.current = busca;
  painelRef.current = painel;
  filtroRef.current = filtro;
  telefoneRef.current = telefone;
  buscaFioRef.current = buscaAplicada;
  ultimaIdRef.current =
    [...mensagens].reverse().find((m) => !m.pendente && Number(m.id) > 0)?.id || 0;

  const sairSeExpirou = useCallback(
    (err) => {
      if (err?.code === "UNAUTHORIZED") {
        clearAdminSession();
        onLogout?.();
        return true;
      }
      return false;
    },
    [onLogout]
  );

  const carregarAgenda = useCallback(async () => {
    try {
      const qs = new URLSearchParams({ busca: buscaRef.current, limit: "80" });
      if (filtroRef.current === "clube") qs.set("temClube", "true");
      const data = await fetchAdmin(`/api/admin/marketing/whatsapp/contatos?${qs}`);
      setContatos(data.contatos || []);
      setErro("");
    } catch (err) {
      if (sairSeExpirou(err)) return;
      setErro(mensagemParaUsuario(err.message));
    }
  }, [sairSeExpirou]);

  const carregarLista = useCallback(async () => {
    try {
      const qs = new URLSearchParams({
        q: buscaRef.current,
        filtro: filtroRef.current,
      });
      const data = await fetchAdmin(`/api/admin/marketing/whatsapp/caixa/conversas?${qs}`);
      setConversas(data.conversas || []);
      setErro("");
    } catch (err) {
      if (sairSeExpirou(err)) return;
      setErro(mensagemParaUsuario(err.message));
    }
  }, [sairSeExpirou]);

  const carregarConversa = useCallback(
    async (tel, { q = "" } = {}) => {
      const qs = new URLSearchParams();
      if (q) qs.set("q", q);
      const data = await fetchAdmin(
        `/api/admin/marketing/whatsapp/caixa/conversas/${encodeURIComponent(tel)}?${qs}`
      );
      return data;
    },
    []
  );

  useEffect(() => {
    if (painel === "agenda") carregarAgenda();
    else carregarLista();
  }, [busca, filtro, painel, carregarLista, carregarAgenda]);

  useEffect(() => {
    const timer = setTimeout(() => setBuscaAplicada(buscaFio.trim()), 350);
    return () => clearTimeout(timer);
  }, [buscaFio]);

  useEffect(() => {
    if (!telefone) return undefined;
    let vivo = true;
    carregarConversa(telefone, { q: buscaAplicada })
      .then((data) => {
        if (!vivo) return;
        setConversa(data);
        setMensagens((prev) => {
          const ficar = [];
          for (const item of prev) {
            if (!item.pendente) continue;
            if (item.telefone === telefone) ficar.push(item);
            else if (item.detalhe?.previaUrl) URL.revokeObjectURL(item.detalhe.previaUrl);
          }
          return juntarMensagens(data.mensagens || [], ficar);
        });
        setTemMais(Boolean(data.temMais) && !buscaAplicada);
        desdeRef.current = data.agora || new Date().toISOString();
        setErro("");
        if (rolarAoAbrirRef.current) {
          rolarAoAbrirRef.current = false;
          requestAnimationFrame(() => fimRef.current?.scrollIntoView({ block: "end" }));
        }
      })
      .catch((err) => {
        if (!vivo || sairSeExpirou(err)) return;
        setErro(mensagemParaUsuario(err.message));
      });
    return () => {
      vivo = false;
    };
  }, [telefone, buscaAplicada, carregarConversa, sairSeExpirou]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (painelRef.current === "agenda") carregarAgenda();
      else carregarLista();
      const tel = telefoneRef.current;
      const ultima = ultimaIdRef.current;
      if (!tel || buscaFioRef.current || !ultima) return;
      const qs = new URLSearchParams({ depois: String(ultima) });
      if (desdeRef.current) qs.set("desde", desdeRef.current);
      fetchAdmin(
        `/api/admin/marketing/whatsapp/caixa/conversas/${encodeURIComponent(tel)}?${qs}`
      )
        .then((data) => {
          setConversa((atual) =>
            atual
              ? {
                  ...atual,
                  janelaAberta: data.janelaAberta,
                  janelaAte: data.janelaAte,
                  atendimento: data.atendimento,
                }
              : atual
          );
          if (data.agora) desdeRef.current = data.agora;
          const novas = data.mensagens || [];
          const ocultos = new Set(data.ocultos || []);
          if (!novas.length && !ocultos.size) return;
          setMensagens((prev) =>
            juntarMensagens(
              ocultos.size ? prev.filter((item) => !ocultos.has(item.id)) : prev,
              novas
            )
          );
          if (pertoDoFimRef.current) {
            requestAnimationFrame(() => fimRef.current?.scrollIntoView({ block: "end" }));
          }
        })
        .catch((err) => {
          if (!sairSeExpirou(err)) setErro(mensagemParaUsuario(err.message));
        });
    }, 8000);
    return () => clearInterval(timer);
  }, [carregarLista, carregarAgenda, sairSeExpirou]);

  function abrir(tel) {
    rolarAoAbrirRef.current = true;
    pertoDoFimRef.current = true;
    setAvisoFio("");
    setBuscaFio("");
    setBuscaAplicada("");
    setBuscaFioAberta(false);
    setTelefone(tel);
    setPedidoAberto(false);
    setPedidoErpAberto(false);
    setFichaAberta(true);
    setSementePedido(null);
    setCompartilhando(null);
    setErroCompartilhar("");
  }

  async function reagirMensagem(mensagem, emoji) {
    try {
      const data = await fetchAdmin(
        `/api/admin/marketing/whatsapp/caixa/mensagens/${mensagem.id}/reagir`,
        { method: "POST", body: JSON.stringify({ emoji }) }
      );
      if (data.mensagem) setMensagens((prev) => juntarMensagens(prev, [data.mensagem]));
    } catch (err) {
      if (!sairSeExpirou(err)) setAvisoFio(mensagemParaUsuario(err.message));
    }
  }

  async function apagarMensagem(mensagem, alcance) {
    try {
      const data = await fetchAdmin(
        `/api/admin/marketing/whatsapp/caixa/mensagens/${mensagem.id}/apagar`,
        { method: "POST", body: JSON.stringify({ alcance }) }
      );
      if (alcance === "mim") {
        setMensagens((prev) => prev.filter((item) => item.id !== mensagem.id));
      } else if (data.mensagem) {
        setMensagens((prev) => juntarMensagens(prev, [data.mensagem]));
      }
    } catch (err) {
      if (!sairSeExpirou(err)) setAvisoFio(mensagemParaUsuario(err.message));
    }
  }

  async function confirmarCompartilhar(telefoneDestino) {
    if (!compartilhando) return;
    setEnviando(true);
    setErroCompartilhar("");
    try {
      const data = await fetchAdmin(
        `/api/admin/marketing/whatsapp/caixa/mensagens/${compartilhando.id}/compartilhar`,
        { method: "POST", body: JSON.stringify({ telefone: telefoneDestino }) }
      );
      setAvisoFio(data.aviso || "Mensagem enviada para o contato.");
      if (telefoneDestino === telefoneRef.current && data.mensagem) {
        setMensagens((prev) => juntarMensagens(prev, [data.mensagem]));
      }
      setCompartilhando(null);
    } catch (err) {
      if (!sairSeExpirou(err)) setErroCompartilhar(mensagemParaUsuario(err.message));
    } finally {
      setEnviando(false);
    }
  }

  async function mudarAtendimento(acao) {
    if (!telefone) return;
    setEnviando(true);
    setAvisoFio("");
    try {
      const data = await fetchAdmin(
        `/api/admin/marketing/whatsapp/caixa/conversas/${encodeURIComponent(telefone)}/atendimento/${acao}`,
        { method: "POST", body: "{}" }
      );
      setConversa((atual) => (atual ? { ...atual, atendimento: data.atendimento } : atual));
      if (data.mensagem) setMensagens((prev) => juntarMensagens(prev, [data.mensagem]));
      if (data.aviso) setAvisoFio(mensagemParaUsuario(data.aviso));
    } catch (err) {
      if (sairSeExpirou(err)) return;
      setAvisoFio(mensagemParaUsuario(err.message));
      try {
        const data = await carregarConversa(telefone);
        setConversa(data);
      } catch {
        /* a conversa aberta permanece */
      }
    } finally {
      setEnviando(false);
    }
  }

  function rolarParaOFim() {
    pertoDoFimRef.current = true;
    requestAnimationFrame(() => fimRef.current?.scrollIntoView({ block: "end" }));
  }

  function criarPendente({ tel, tipo, texto, arquivo }) {
    const ordem = ordemRef.current++;
    const nome = conversa?.atendimento?.nome || "";
    const detalhe = nome ? { autorNome: nome } : {};
    if (arquivo) {
      const tipoMidia = tipoLocal(arquivo);
      detalhe.temMidia = true;
      detalhe.mime = mimeDeArquivo(arquivo, tipoMidia);
      detalhe.previaUrl = URL.createObjectURL(arquivo);
      if (arquivo.voz) detalhe.voice = true;
      if (tipoMidia === "document") detalhe.nomeArquivo = arquivo.name;
    }
    return {
      id: `p-${ordem}`,
      ordem,
      pendente: true,
      enviando: true,
      falha: "",
      telefone: tel,
      arquivo: arquivo || null,
      direcao: "out",
      origem: "atendimento",
      tipo: tipo || "text",
      texto: texto || "",
      detalhe,
      criadoEm: new Date().toISOString(),
    };
  }

  function enfileirar(tel, trabalho) {
    const anterior = filasRef.current.get(tel) || Promise.resolve();
    const exec = anterior.then(() => trabalho()).catch(() => {});
    filasRef.current.set(tel, exec);
  }

  function aplicarConversa(tel, data) {
    if (telefoneRef.current !== tel || !data) return;
    setConversa((atual) =>
      atual
        ? {
            ...atual,
            janelaAberta: data.janelaAberta ?? atual.janelaAberta,
            janelaAte: data.janelaAte ?? atual.janelaAte,
            atendimento: data.atendimento ?? atual.atendimento,
          }
        : atual
    );
  }

  function trocarPendentes(tel, ids, reais) {
    const remover = new Set(ids.filter(Boolean));
    setMensagens((prev) => {
      if (telefoneRef.current !== tel) return prev;
      const sem = [];
      for (const item of prev) {
        if (!remover.has(item.id)) {
          sem.push(item);
          continue;
        }
        if (item.detalhe?.previaUrl) URL.revokeObjectURL(item.detalhe.previaUrl);
      }
      return juntarMensagens(sem, reais);
    });
  }

  function marcarFalha(tel, ids, textoFalha) {
    const alvos = new Set(ids.filter(Boolean));
    if (telefoneRef.current !== tel) return;
    setMensagens((prev) =>
      prev.map((item) =>
        alvos.has(item.id) ? { ...item, enviando: false, falha: textoFalha } : item
      )
    );
  }

  async function postarTexto(tel, texto) {
    const data = await fetchAdmin(
      `/api/admin/marketing/whatsapp/caixa/conversas/${encodeURIComponent(tel)}/responder`,
      { method: "POST", body: JSON.stringify({ texto }) }
    );
    return data;
  }

  async function postarMidia(tel, arquivo, legenda) {
    const session = loadAdminSession();
    if (!session?.token) {
      const expirada = new Error("Sessão de administrador não encontrada");
      expirada.code = "UNAUTHORIZED";
      throw expirada;
    }
    const form = new FormData();
    form.append("arquivo", arquivo);
    form.append("legenda", legenda || "");
    if (arquivo.voz) form.append("voz", "1");
    const response = await fetch(
      apiUrl(`/api/admin/marketing/whatsapp/caixa/conversas/${encodeURIComponent(tel)}/midia`),
      {
        method: "POST",
        cache: "no-store",
        headers: { Authorization: `Bearer ${session.token}` },
        body: form,
      }
    );
    const { data } = await parseApiResponse(response);
    if (response.status === 401) {
      const expirada = new Error(
        mensagemParaUsuario(data.error || "Sessão expirada. Faça login novamente.")
      );
      expirada.code = "UNAUTHORIZED";
      throw expirada;
    }
    if (!response.ok) throw new Error(mensagemParaUsuario(data.error));
    return data;
  }

  function tratarFalhaEnvio(tel, ids, err) {
    if (sairSeExpirou(err)) return true;
    const mensagem = mensagemParaUsuario(err.message) || "Não enviou";
    const janela = /janela de 24 horas/i.test(mensagem);
    if (janela && telefoneRef.current === tel) {
      setConversa((atual) => (atual ? { ...atual, janelaAberta: false } : atual));
    }
    if (/passou de|passa de|ainda ficou com|máx\. 16 MB/i.test(mensagem)) {
      if (telefoneRef.current === tel) setAvisoFio(mensagem);
      trocarPendentes(tel, ids, []);
      return false;
    }
    marcarFalha(tel, ids, mensagem);
    return janela;
  }

  function enviarResposta(texto) {
    const tel = telefone;
    const corpo = String(texto || "").trim();
    if (!tel || !corpo) return;
    const local = criarPendente({ tel, tipo: "text", texto: corpo });
    setMensagens((prev) => juntarMensagens(prev, [local]));
    rolarParaOFim();
    enfileirar(tel, async () => {
      try {
        const data = await postarTexto(tel, corpo);
          aplicarConversa(tel, data);
        if (!data.mensagem) {
          marcarFalha(tel, [local.id], "Não enviou");
          return;
        }
        trocarPendentes(tel, [local.id], [data.mensagem]);
      } catch (err) {
        tratarFalhaEnvio(tel, [local.id], err);
      }
    });
  }

  function enviarMidia(arquivos, legenda) {
    const tel = telefone;
    const recebidos = [...(arquivos || [])].filter(Boolean);
    const grande = recebidos.find((arquivo) => !arquivoCabeNoWhatsapp(arquivo));
    const lista = recebidos.filter((arquivo) => arquivoCabeNoWhatsapp(arquivo));
    if (grande) setAvisoFio(avisoArquivoGrande(grande));
    if (!tel || !lista.length) return;
    const caption = String(legenda || "").trim();
    const locais = [];
    lista.forEach((arquivo, indice) => {
      const ultimo = indice === lista.length - 1;
      const tipo = tipoLocal(arquivo);
      const comLegenda = ultimo && tipo !== "audio" ? caption : "";
      const local = criarPendente({ tel, tipo, texto: comLegenda, arquivo });
      locais.push(local);
      if (ultimo && tipo === "audio" && caption) {
        locais.push(criarPendente({ tel, tipo: "text", texto: caption }));
      }
    });
    setMensagens((prev) => juntarMensagens(prev, locais));
    rolarParaOFim();
    enfileirar(tel, async () => {
      let parar = false;
      for (let indice = 0; indice < locais.length; indice += 1) {
        const local = locais[indice];
        const seguinte = locais[indice + 1];
        const legendaAudio =
          local.arquivo &&
          tipoLocal(local.arquivo) === "audio" &&
          seguinte &&
          !seguinte.arquivo &&
          seguinte.texto
            ? seguinte
            : null;
        if (parar) {
          marcarFalha(tel, [local.id, legendaAudio?.id], "Não enviou");
          if (legendaAudio) indice += 1;
          continue;
        }
        try {
          const data = local.arquivo
            ? await postarMidia(tel, local.arquivo, legendaAudio ? legendaAudio.texto : local.texto)
            : await postarTexto(tel, local.texto);
          aplicarConversa(tel, data);
          if (data.aviso && telefoneRef.current === tel) setAvisoFio(data.aviso);
          const recebidas = data.mensagens?.length
            ? data.mensagens
            : data.mensagem
              ? [data.mensagem]
              : [];
          const ids = [local.id];
          if (legendaAudio) {
            ids.push(legendaAudio.id);
            indice += 1;
          }
          if (!recebidas.length) {
            marcarFalha(tel, ids, "Não enviou");
            continue;
          }
          trocarPendentes(tel, ids, recebidas);
        } catch (err) {
          const ids = [local.id];
          if (legendaAudio) {
            ids.push(legendaAudio.id);
            indice += 1;
          }
          if (tratarFalhaEnvio(tel, ids, err)) parar = true;
        }
      }
    });
  }

  function tentarDeNovo(mensagem) {
    if (!mensagem?.pendente || !mensagem.falha) return;
    const tel = mensagem.telefone;
    setMensagens((prev) =>
      prev.map((item) =>
        item.id === mensagem.id ? { ...item, enviando: true, falha: "" } : item
      )
    );
    enfileirar(tel, async () => {
      try {
        const data = mensagem.arquivo
          ? await postarMidia(tel, mensagem.arquivo, mensagem.texto)
          : await postarTexto(tel, mensagem.texto);
        aplicarConversa(tel, data);
        const recebidas = data.mensagens?.length
          ? data.mensagens
          : data.mensagem
            ? [data.mensagem]
            : [];
        trocarPendentes(tel, [mensagem.id], recebidas);
      } catch (err) {
        tratarFalhaEnvio(tel, [mensagem.id], err);
      }
    });
  }

  async function irParaTelefone(tel) {
    const destino = normalizarTelefoneWa(tel);
    if (!destino || destino === telefone) return;
    try {
      await carregarConversa(destino);
      abrir(destino);
    } catch (err) {
      if (sairSeExpirou(err)) return;
      if (/não encontrada/i.test(err.message || "")) {
        setAvisoFio("Este número ainda não tem conversa no Superama.");
        return;
      }
      setErro(mensagemParaUsuario(err.message));
    }
  }

  async function carregarAntigas() {
    if (!telefone || !temMais || !mensagens[0] || buscaAplicada || carregandoAntigasRef.current) {
      return;
    }
    carregandoAntigasRef.current = true;
    const painel = listaRef.current;
    const altura = painel?.scrollHeight || 0;
    try {
      const qs = new URLSearchParams({ antes: String(mensagens[0].id) });
      const data = await fetchAdmin(
        `/api/admin/marketing/whatsapp/caixa/conversas/${encodeURIComponent(telefone)}?${qs}`
      );
      setMensagens((prev) => juntarMensagens(data.mensagens || [], prev));
      setTemMais(Boolean(data.temMais));
      requestAnimationFrame(() => {
        if (painel) painel.scrollTop += painel.scrollHeight - altura;
      });
    } catch (err) {
      if (!sairSeExpirou(err)) setErro(mensagemParaUsuario(err.message));
    } finally {
      carregandoAntigasRef.current = false;
    }
  }

  function aoRolar() {
    const painel = listaRef.current;
    if (!painel) return;
    const distancia = painel.scrollHeight - painel.scrollTop - painel.clientHeight;
    pertoDoFimRef.current = distancia < 96;
    if (painel.scrollTop < 48) carregarAntigas();
  }

  const fichaVisivel = fichaAberta && !pedidoAberto && !pedidoErpAberto;

  const classe = [
    "wa-caixa",
    telefone ? "wa-caixa--conversa" : "",
    pedidoAberto || pedidoErpAberto ? "wa-caixa--pedido" : "",
    fichaAberta || pedidoAberto || pedidoErpAberto ? "" : "wa-caixa--sem-ficha",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <>
      <CompartilharWhatsapp
        aberto={Boolean(compartilhando)}
        enviando={enviando}
        erroEnvio={erroCompartilhar}
        onFechar={() => {
          setCompartilhando(null);
          setErroCompartilhar("");
        }}
        onEscolher={confirmarCompartilhar}
      />
      <div className={classe}>
      <header className="wa-caixa__top">
        <button type="button" className="wa-caixa__voltar" onClick={onVoltar}>
          Voltar ao clube
        </button>
        <div>
          <h1>Atendimento</h1>
          <p>
            {painel === "agenda"
              ? contatos.length
                ? `${contatos.length} contato${contatos.length === 1 ? "" : "s"}`
                : "Nenhum contato nesta busca"
              : conversas.length
                ? `${conversas.length} conversa${conversas.length === 1 ? "" : "s"}`
                : "Nenhuma conversa nesta busca"}
          </p>
        </div>
      </header>

      {erro && (
        <p className="wa-caixa__aviso" role="alert">
          {erro}
        </p>
      )}

      <div className="wa-caixa__corpo">
        <aside className="wa-caixa__lista">
          <div className="wa-caixa__busca">
            <div className="wa-caixa__modos" role="tablist" aria-label="Lista do atendimento">
              <button
                type="button"
                role="tab"
                aria-selected={painel === "conversas"}
                className={painel === "conversas" ? "is-on" : ""}
                onClick={() => setPainel("conversas")}
              >
                Conversas
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={painel === "agenda"}
                className={painel === "agenda" ? "is-on" : ""}
                onClick={() => {
                  setPainel("agenda");
                  if (filtro === "catalogo") setFiltro("todos");
                }}
              >
                Agenda
              </button>
            </div>
            <input
              type="search"
              placeholder={painel === "agenda" ? "Nome ou telefone na agenda" : "Nome ou telefone"}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              aria-label={painel === "agenda" ? "Buscar contato" : "Buscar conversa"}
            />
            <div className="wa-caixa__filtros">
              {(painel === "agenda" ? FILTROS_AGENDA : FILTROS).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={filtro === item.id ? "is-on" : ""}
                  onClick={() => setFiltro(item.id)}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="wa-caixa__itens">
            {painel === "agenda" ? (
              contatos.length === 0 ? (
                <p className="wa-caixa__vazio">Nenhum contato na agenda.</p>
              ) : (
                contatos.map((contato) => {
                  const nome = contato.nomeWa || contato.nomeClube || contato.telefoneExibicao;
                  return (
                    <button
                      key={contato.telefone}
                      type="button"
                      className={`wa-caixa__item${contato.telefone === telefone ? " is-on" : ""}`}
                      onClick={() => abrir(contato.telefone)}
                    >
                      <span className="wa-caixa__avatar wa-caixa__avatar--lista" aria-hidden>
                        {iniciais(nome)}
                      </span>
                      <span className="wa-caixa__item-corpo">
                        <span className="wa-caixa__item-topo">
                          <strong>{nome}</strong>
                        </span>
                        <small>
                          {contato.temClube ? "Clube · " : ""}
                          {contato.telefoneExibicao}
                          {contato.janelaAberta ? " · Janela aberta" : " · Janela fechada"}
                        </small>
                      </span>
                    </button>
                  );
                })
              )
            ) : conversas.length === 0 ? (
              <p className="wa-caixa__vazio">Nenhuma conversa ainda.</p>
            ) : (
              conversas.map((item) => (
                <button
                  key={item.telefone}
                  type="button"
                  className={`wa-caixa__item${item.telefone === telefone ? " is-on" : ""}`}
                  onClick={() => abrir(item.telefone)}
                >
                  <span className="wa-caixa__avatar wa-caixa__avatar--lista" aria-hidden>
                    {iniciais(item.nome || item.telefoneFormatado)}
                  </span>
                  <span className="wa-caixa__item-corpo">
                    <span className="wa-caixa__item-topo">
                      <strong>{item.nome || item.telefoneFormatado}</strong>
                      <time>{horaCurta(item.ultimaEm)}</time>
                    </span>
                    <small>
                      {item.temClube ? "Clube · " : ""}
                      {item.ultimaDirecao === "out" ? "Você: " : ""}
                      {resumoLista(item)}
                    </small>
                  </span>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="wa-caixa__fio" aria-label="Conversa">
          {!telefone ? (
            <div className="wa-caixa__vazio wa-caixa__vazio--centro">
              <strong>Escolha uma conversa</strong>
              <p>A lista à esquerda mostra as conversas. Em Agenda ficam os contatos deste WhatsApp.</p>
            </div>
          ) : (
            <>
              <header className="wa-caixa__fio-head">
                <div className="wa-caixa__quem">
                  <button
                    type="button"
                    className="wa-caixa__ficha-toggle wa-caixa__so-mobile"
                    onClick={() => setTelefone("")}
                  >
                    Conversas
                  </button>
                  <span className="wa-caixa__avatar" aria-hidden>
                    {iniciais(conversa?.nome || conversa?.telefoneFormatado)}
                  </span>
                  <span className="wa-caixa__quem-texto">
                    <strong>{conversa?.nome || conversa?.telefoneFormatado || "Carregando…"}</strong>
                    <span>
                      {conversa?.telefoneFormatado}
                      {conversa?.temClube ? " · Clube" : ""}
                    </span>
                    <em className={conversa?.janelaAberta ? "wa-caixa__janela is-ok" : "wa-caixa__janela is-off"}>
                      {textoJanela(conversa)}
                      {conversa?.atendimento ? ` · ${conversa.atendimento.nome}` : ""}
                    </em>
                  </span>
                </div>
                <div className="wa-caixa__fio-tools">
                  {buscaFioAberta && (
                    <input
                      className="wa-caixa__busca-fio"
                      type="search"
                      placeholder="Buscar"
                      value={buscaFio}
                      onChange={(e) => setBuscaFio(e.target.value)}
                      aria-label="Buscar nesta conversa"
                      autoFocus
                    />
                  )}
                  <button
                    type="button"
                    className={`wa-caixa__tool${buscaFioAberta ? " is-on" : ""}`}
                    aria-label="Buscar nesta conversa"
                    onClick={() => setBuscaFioAberta((v) => !v)}
                  >
                    ⌕
                  </button>
                  <div className="wa-caixa__acoes" role="group" aria-label="Painéis da conversa">
                    <button
                      type="button"
                      className={`wa-caixa__acao${pedidoAberto ? " is-on" : ""}`}
                      aria-pressed={pedidoAberto}
                      aria-label={pedidoAberto ? "Fechar pedido" : "Fazer pedido"}
                      onClick={() => {
                        setPedidoErpAberto(false);
                        setPedidoAberto((v) => !v);
                      }}
                    >
                      <ShoppingBag size={15} strokeWidth={2.25} aria-hidden />
                      Pedido
                    </button>
                    {PEDIDO_ERP_VISIVEL && (
                      <button
                        type="button"
                        className={`wa-caixa__acao${pedidoErpAberto ? " is-on" : ""}`}
                        aria-pressed={pedidoErpAberto}
                        aria-label={pedidoErpAberto ? "Fechar pedido ERP" : "Fazer pedido ERP"}
                        onClick={() => {
                          setPedidoAberto(false);
                          setPedidoErpAberto((v) => !v);
                        }}
                      >
                        Pedido ERP
                      </button>
                    )}
                    <button
                      type="button"
                      className={`wa-caixa__acao${fichaVisivel ? " is-on" : ""}`}
                      aria-pressed={fichaVisivel}
                      aria-label={fichaVisivel ? "Ocultar ficha" : "Mostrar ficha"}
                      onClick={() => {
                        if (pedidoAberto || pedidoErpAberto) {
                          setPedidoAberto(false);
                          setPedidoErpAberto(false);
                          setFichaAberta(true);
                          return;
                        }
                        setFichaAberta((v) => !v);
                      }}
                    >
                      <IdCard size={15} strokeWidth={2.25} aria-hidden />
                      Ficha
                    </button>
                  </div>
                </div>
              </header>
              {avisoFio && (
                <p className="wa-caixa__aviso" role="status">
                  {avisoFio}
                </p>
              )}
              <div className="wa-caixa__msgs" ref={listaRef} onScroll={aoRolar}>
                {temMais && !buscaAplicada && (
                  <button type="button" className="wa-caixa__mais" onClick={carregarAntigas}>
                    Mensagens anteriores
                  </button>
                )}
                {buscaAplicada && mensagens.length === 0 && (
                  <p className="wa-caixa__vazio">Nenhuma mensagem com esse texto.</p>
                )}
                {linhasDoFio(mensagens).map((linha) =>
                  linha.tipo === "dia" ? (
                    <div key={linha.id} className="wa-caixa__dia">
                      {linha.rotulo}
                    </div>
                  ) : (
                    <BolhaWhatsapp
                      key={linha.id}
                      mensagem={linha.msg}
                      agrupada={linha.agrupada}
                      busca={buscaAplicada}
                      atendendo={conversa?.atendimento?.meu === true}
                      onTelefone={irParaTelefone}
                      onTentar={tentarDeNovo}
                      onReagir={reagirMensagem}
                      onApagar={apagarMensagem}
                      onCompartilhar={setCompartilhando}
                      onVirarPedido={(itens) => {
                        setPedidoAberto(true);
                        setSementePedido(itens);
                      }}
                    />
                  )
                )}
                <div ref={fimRef} />
              </div>
              {!conversa ? (
                <div className="wa-caixa__compositor wa-caixa__compositor--espera" />
              ) : conversa.atendimento?.meu ? (
                <div className="wa-caixa__atender">
                  <CompositorWhatsapp
                    key={telefone}
                    pronto
                    aberto={conversa.janelaAberta === true}
                    onEnviar={enviarResposta}
                    onEnviarMidia={enviarMidia}
                  />
                  <button
                    type="button"
                    className="wa-caixa__finalizar"
                    disabled={enviando}
                    onClick={() => mudarAtendimento("finalizar")}
                  >
                    Finalizar atendimento
                  </button>
                </div>
              ) : conversa.atendimento ? (
                <div className="wa-caixa__compositor wa-caixa__compositor--fechado">
                  <p>Atendido por: {conversa.atendimento.nome}. Só essa pessoa responde agora.</p>
                </div>
              ) : (
                <div className="wa-caixa__compositor">
                  <button
                    type="button"
                    className="wa-caixa__iniciar"
                    disabled={enviando}
                    onClick={() => mudarAtendimento("iniciar")}
                  >
                    Iniciar atendimento
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        {PEDIDO_ERP_VISIVEL && pedidoErpAberto && telefone ? (
          <PedidoErpWhatsapp
            telefone={telefone}
            conversa={conversa}
            onFechar={() => setPedidoErpAberto(false)}
            onEnviado={(data) => {
              if (data.mensagem) setMensagens((prev) => juntarMensagens(prev, [data.mensagem]));
              if (data.atendimento) {
                setConversa((atual) => (atual ? { ...atual, atendimento: data.atendimento } : atual));
              }
            }}
          />
        ) : pedidoAberto && telefone ? (
          <PedidoWhatsapp
            telefone={telefone}
            conversa={conversa}
            semente={sementePedido}
            onSementeConsumida={() => setSementePedido(null)}
            onFechar={() => setPedidoAberto(false)}
            onEnviado={(data) => {
              if (data.mensagem) setMensagens((prev) => juntarMensagens(prev, [data.mensagem]));
              if (data.atendimento) {
                setConversa((atual) => (atual ? { ...atual, atendimento: data.atendimento } : atual));
              }
            }}
          />
        ) : (
        <aside className="wa-caixa__ficha" aria-label="Ficha do contato">
          <header className="wa-caixa__ficha-head">
            <strong>Contato</strong>
          </header>
          <div className="wa-caixa__ficha-corpo">
            {!conversa ? (
              <p>A ficha aparece quando uma conversa está aberta.</p>
            ) : (
              <>
                <strong>{conversa.nome || "Sem nome no clube"}</strong>
                <p>{conversa.telefoneFormatado}</p>
                {conversa.nomeWa && conversa.nome && conversa.nome !== conversa.nomeWa && (
                  <p>WhatsApp: {conversa.nomeWa}</p>
                )}
                <div className="wa-caixa__ficha-bloco">
                  <span className="wa-caixa__ficha-rotulo">Janela de resposta</span>
                  <p className={conversa.janelaAberta ? "is-ok" : "is-off"}>
                    {textoJanela(conversa)}
                  </p>
                </div>
                <div className="wa-caixa__ficha-bloco">
                  <span className="wa-caixa__ficha-rotulo">Atendimento</span>
                  {conversa.atendimento ? (
                    <>
                      <p>{conversa.atendimento.nome}</p>
                      <p className="is-ok">
                        Pausa até {horaPrazo(conversa.atendimento.expiraEm) || "—"}
                      </p>
                    </>
                  ) : (
                    <p>Ninguém em atendimento</p>
                  )}
                </div>
                <div className="wa-caixa__ficha-bloco">
                  <span className="wa-caixa__ficha-rotulo">Clube</span>
                  {conversa.temClube ? (
                    <>
                      <span className="wa-caixa__selo">Membro do clube</span>
                      {conversa.cpfMascarado && <p>CPF {conversa.cpfMascarado}</p>}
                    </>
                  ) : (
                    <p>Ainda não é membro do clube</p>
                  )}
                </div>
              </>
            )}
          </div>
        </aside>
        )}
      </div>
    </div>
    </>
  );
}
