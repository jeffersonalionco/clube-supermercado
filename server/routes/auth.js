import { Router } from "express";
import {
  buscarClientePorCpfCnpj,
  cadastrarClienteApi,
  normalizarCpfCnpj,
} from "../services/apiClient.js";
import { montarPayloadCadastro } from "../services/cadastroCliente.js";
import { mensagemParaCliente } from "../utils/mensagemCliente.js";
import { criarTokenSessao } from "../services/sessionToken.js";
import { requireAuth } from "../middleware/requireAuth.js";
import {
  buscarUsuarioPorCpf,
  criarUsuario,
  usuarioPublico,
  validarSenha,
} from "../services/usuarioService.js";

const router = Router();

function respostaLogin(res, status, usuario, extra = {}) {
  const token = criarTokenSessao(usuario);
  return res.status(status).json({
    success: true,
    token,
    usuario: usuarioPublico(usuario),
    ...extra,
  });
}

router.post("/login", async (req, res) => {
  const { cpf, senha } = req.body || {};
  const cpfNorm = normalizarCpfCnpj(cpf);

  if (!cpfNorm || (cpfNorm.length !== 11 && cpfNorm.length !== 14)) {
    return res.status(400).json({ error: "Informe um CPF ou CNPJ válido" });
  }

  if (!senha || String(senha).length < 4) {
    return res.status(400).json({ error: "Informe uma senha com pelo menos 4 caracteres" });
  }

  try {
    const existente = await buscarUsuarioPorCpf(cpfNorm);

    if (existente) {
      const senhaOk = await validarSenha(senha, existente.senha_hash);
      if (!senhaOk) {
        return res.status(401).json({ error: "CPF ou senha incorretos" });
      }

      return respostaLogin(res, 200, existente, {
        message: "Login realizado com sucesso",
      });
    }

    const consulta = await buscarClientePorCpfCnpj(cpfNorm);
    if (!consulta.ok) {
      return res.status(404).json({
        error: consulta.error || "CPF/CNPJ não encontrado no cadastro",
        cadastrarNoClube: true,
      });
    }

    const novo = await criarUsuario({
      cpf: cpfNorm,
      senha,
      clienteApi: consulta.cliente,
      dadosApi: consulta.raw,
    });

    return respostaLogin(res, 201, novo, {
      message: "Cadastro confirmado e senha criada com sucesso",
      primeiroAcesso: true,
    });
  } catch (error) {
    console.error("[auth/login]", error.message);
    return res.status(500).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

router.get("/verificar-cpf/:cpf", async (req, res) => {
  const cpfNorm = normalizarCpfCnpj(req.params.cpf);

  if (!cpfNorm || (cpfNorm.length !== 11 && cpfNorm.length !== 14)) {
    return res.status(400).json({ error: "Informe um CPF ou CNPJ válido" });
  }

  try {
    const local = await buscarUsuarioPorCpf(cpfNorm);
    const consulta = await buscarClientePorCpfCnpj(cpfNorm);

    return res.json({
      cpf: cpfNorm,
      existeNoSistema: consulta.ok,
      cadastradoNaPlataforma: Boolean(local),
      cliente: consulta.ok ? consulta.cliente : null,
    });
  } catch (error) {
    console.error("[auth/verificar-cpf]", error.message);
    return res.status(500).json({ error: mensagemParaCliente(error.message) });
  }
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ usuario: usuarioPublico(req.usuario) });
});

router.post("/cadastro-clube", async (req, res) => {
  const body = req.body || {};
  const cpfNorm = normalizarCpfCnpj(body.cpf || body.cpfCnpj);

  if (!cpfNorm || cpfNorm.length !== 11) {
    return res.status(400).json({ error: "CPF inválido" });
  }

  try {
    const existenteApi = await buscarClientePorCpfCnpj(cpfNorm);
    if (existenteApi.ok) {
      return res.status(409).json({
        error: "Este CPF já possui cadastro no sistema. Faça login.",
      });
    }

    const payload = montarPayloadCadastro({ ...body, cpf: cpfNorm });
    const resultado = await cadastrarClienteApi(payload);

    if (!resultado.ok) {
      return res.status(400).json({
        error: mensagemParaCliente(resultado.error),
      });
    }

    return res.status(201).json({
      success: true,
      message: resultado.message,
      cliente: { codigo: resultado.codigo },
    });
  } catch (error) {
    console.error("[auth/cadastro-clube]", error.message);
    return res.status(400).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

export default router;
