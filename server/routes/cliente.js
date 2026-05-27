import { Router } from "express";
import {
  atualizarClienteApi,
  buscarClientePorCpfCnpj,
  buscarVendasClienteApi,
  normalizarCpfCnpj,
} from "../services/apiClient.js";
import { apresentarVendas } from "../services/vendasPresenter.js";
import { periodoMesAtual, validarPeriodoVendas } from "../utils/periodoVendas.js";
import { montarPayloadAtualizacao } from "../services/cadastroCliente.js";
import { apresentarCliente } from "../services/clientePresenter.js";
import { atualizarDadosUsuario } from "../services/usuarioService.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { mensagemParaCliente } from "../utils/mensagemCliente.js";

function resolverCodigoCliente(usuario, cliente) {
  const doUsuario = usuario.cliente_codigo;
  if (doUsuario != null && String(doUsuario).trim() !== "") {
    return String(doUsuario);
  }
  const doCliente =
    cliente?.codigo ?? cliente?.codigo_cliente ?? cliente?.id;
  return doCliente != null ? String(doCliente) : null;
}

const router = Router();

router.use(requireAuth);

/** Dados do cliente logado — CPF vem só do token, nunca do body/query. */
router.get("/me", async (req, res) => {
  try {
    const consulta = await buscarClientePorCpfCnpj(req.usuario.cpf);

    if (!consulta.ok) {
      return res.status(404).json({
        error: consulta.error || "Cadastro não encontrado na API",
      });
    }

    const dados = apresentarCliente({
      usuario: req.usuario,
      cliente: consulta.cliente,
      raw: consulta.raw,
    });

    return res.json({
      usuario: {
        id: req.usuario.id,
        cpf: req.usuario.cpf,
        nome: dados.perfil.nome,
        clienteCodigo: req.usuario.cliente_codigo,
      },
      ...dados,
    });
  } catch (error) {
    console.error("[cliente/me]", error.message);
    return res.status(500).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

/** Atualiza dados do cliente logado — PUT /v1.8/clientes/{codigo}. */
router.put("/me", async (req, res) => {
  try {
    const consulta = await buscarClientePorCpfCnpj(req.usuario.cpf);

    if (!consulta.ok) {
      return res.status(404).json({
        error: consulta.error || "Cadastro não encontrado na API",
      });
    }

    const codigo = resolverCodigoCliente(req.usuario, consulta.cliente);
    if (!codigo) {
      return res.status(400).json({
        error: "Não foi possível identificar o código do seu cadastro.",
      });
    }

    const cpfBody = normalizarCpfCnpj(req.body?.cpf);
    if (cpfBody && cpfBody !== req.usuario.cpf) {
      return res.status(403).json({
        error: "Não é permitido alterar o CPF da conta.",
      });
    }

    let payload;
    try {
      payload = montarPayloadAtualizacao(
        { ...req.body, cpf: req.usuario.cpf },
        consulta.cliente
      );
    } catch (err) {
      return res.status(400).json({ error: mensagemParaCliente(err.message) });
    }

    const resultado = await atualizarClienteApi(codigo, payload);

    if (!resultado.ok) {
      return res.status(400).json({ error: mensagemParaCliente(resultado.error) });
    }

    const atualizado = await buscarClientePorCpfCnpj(req.usuario.cpf);
    const clienteAtual = atualizado.ok ? atualizado.cliente : consulta.cliente;

    await atualizarDadosUsuario(req.usuario.id, {
      nome: payload.nome,
      clienteCodigo: Number(codigo) || codigo,
      dadosApi: clienteAtual,
    });

    const dados = apresentarCliente({
      usuario: {
        ...req.usuario,
        nome: payload.nome,
        cliente_codigo: Number(codigo) || codigo,
      },
      cliente: clienteAtual,
      raw: atualizado.ok ? atualizado.raw : consulta.raw,
    });

    return res.json({
      message: resultado.message || "Dados atualizados com sucesso",
      usuario: {
        id: req.usuario.id,
        cpf: req.usuario.cpf,
        nome: dados.perfil.nome,
        clienteCodigo: codigo,
      },
      ...dados,
    });
  } catch (error) {
    console.error("[cliente/me PUT]", error.message);
    return res.status(500).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

/** Compras do cliente no período — máx. 90 dias. CPF só do token. */
router.get("/vendas", async (req, res) => {
  try {
    let dataini = req.query.dataini;
    let datafim = req.query.datafim;

    if (!dataini || !datafim) {
      const padrao = periodoMesAtual();
      dataini = padrao.dataini;
      datafim = padrao.datafim;
    }

    const periodoVal = validarPeriodoVendas(dataini, datafim);
    if (!periodoVal.ok) {
      return res.status(400).json({ error: periodoVal.error });
    }

    const resultado = await buscarVendasClienteApi(
      req.usuario.cpf,
      periodoVal.dataini,
      periodoVal.datafim
    );

    if (!resultado.ok) {
      return res.status(400).json({
        error: mensagemParaCliente(resultado.error),
      });
    }

    const apresentacao = await apresentarVendas(resultado.itens, {
      dataini: periodoVal.dataini,
      datafim: periodoVal.datafim,
      dias: periodoVal.dias,
    });

    return res.json(apresentacao);
  } catch (error) {
    console.error("[cliente/vendas]", error.message);
    return res.status(500).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

export default router;
