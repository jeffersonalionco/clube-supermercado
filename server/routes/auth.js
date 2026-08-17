import { Router } from "express";
import {
  atualizarClienteApi,
  buscarClientePorCpfCnpj,
  cadastrarClienteApi,
  normalizarCpfCnpj,
} from "../services/apiClient.js";
import {
  montarPayloadAtualizacao,
  montarPayloadCadastro,
} from "../services/cadastroCliente.js";
import { mensagemParaCliente } from "../utils/mensagemCliente.js";
import { criarTokenSessao } from "../services/sessionToken.js";
import { requireAuth } from "../middleware/requireAuth.js";
import { authLimiter, verificarCpfLimiter, recuperarSenhaRedefinirLimiter, recuperarSenhaSolicitarLimiter } from "../middleware/rateLimit.js";
import { validarSenhaCadastro, validarSenhaLogin } from "../utils/senha.js";
import {
  cpfDigitosValidos,
  emailValido,
  telefoneValido,
} from "../utils/validacaoCadastro.js";
import {
  buscarUsuarioPorCpf,
  criarUsuario,
  usuarioPublico,
  validarSenha,
} from "../services/usuarioService.js";
import {
  EVENTOS_CLIENTE,
  registrarEventoCliente,
} from "../services/clienteAuditoriaService.js";
import {
  apresentarProgramaCliente,
  obterConfigPrograma,
} from "../services/programaConfigService.js";
import {
  mensagemRecuperacaoGenerica,
  redefinirSenhaComRecuperacao,
  solicitarRecuperacaoSenha,
} from "../services/senhaRecuperacaoService.js";

const router = Router();

function resolverCodigoClienteApi(cliente) {
  const codigo =
    cliente?.codigo ?? cliente?.codigo_cliente ?? cliente?.id ?? null;
  return codigo != null && String(codigo).trim() !== ""
    ? String(codigo).trim()
    : null;
}

/** Status público do programa (login/cadastro). */
router.get("/programa", async (_req, res) => {
  try {
    const config = await obterConfigPrograma();
    return res.json(apresentarProgramaCliente(config));
  } catch (error) {
    console.error("[auth/programa]", error.message);
    return res.status(500).json({
      error: mensagemParaCliente(error.message),
    });
  }
});

router.use(authLimiter);

function respostaLogin(res, status, usuario, extra = {}) {
  const token = criarTokenSessao(usuario);
  return obterConfigPrograma().then((config) =>
    res.status(status).json({
      success: true,
      token,
      usuario: usuarioPublico(usuario),
      programa: apresentarProgramaCliente(config),
      ...extra,
    })
  );
}

router.post("/login", async (req, res) => {
  const { cpf, senha, aceiteLegal, email, celular, telefone } = req.body || {};
  const cpfNorm = normalizarCpfCnpj(cpf);

  if (!cpfDigitosValidos(cpfNorm)) {
    return res.status(400).json({ error: "Informe um CPF válido" });
  }

  const senhaLogin = validarSenhaLogin(senha);
  if (!senhaLogin.ok) {
    await registrarEventoCliente({
      cpf: cpfNorm,
      evento: EVENTOS_CLIENTE.LOGIN_FALHA_VALIDACAO,
      sucesso: false,
      req,
      detalhes: { motivo: senhaLogin.error },
    });
    return res.status(400).json({ error: senhaLogin.error });
  }

  try {
    const existente = await buscarUsuarioPorCpf(cpfNorm);

    if (existente) {
      const senhaOk = await validarSenha(senha, existente.senha_hash);
      if (!senhaOk) {
        await registrarEventoCliente({
          usuarioId: existente.id,
          cpf: cpfNorm,
          evento: EVENTOS_CLIENTE.LOGIN_FALHA_SENHA,
          sucesso: false,
          req,
        });
        return res.status(401).json({ error: "CPF ou senha incorretos" });
      }

      await registrarEventoCliente({
        usuarioId: existente.id,
        cpf: cpfNorm,
        evento: EVENTOS_CLIENTE.LOGIN_SUCESSO,
        sucesso: true,
        req,
      });

      return respostaLogin(res, 200, existente, {
        message: "Login realizado com sucesso",
      });
    }

    const consulta = await buscarClientePorCpfCnpj(cpfNorm);
    if (!consulta.ok) {
      return res.status(404).json({
        error: consulta.error || "CPF não encontrado no cadastro",
        cadastrarNoClube: true,
      });
    }

    if (!aceiteLegal) {
      return res.status(400).json({
        error: "É necessário aceitar o Regulamento e a Política de Privacidade",
        requerAceiteLegal: true,
      });
    }

    const senhaCadastro = validarSenhaCadastro(senha);
    if (!senhaCadastro.ok) {
      return res.status(400).json({ error: senhaCadastro.error });
    }

    const emailNorm = String(email || "")
      .trim()
      .toLowerCase();
    const celularNorm = String(celular || telefone || "").replace(/\D/g, "");

    if (!emailValido(emailNorm)) {
      return res.status(400).json({ error: "Informe um e-mail válido" });
    }
    if (!telefoneValido(celularNorm)) {
      return res.status(400).json({
        error: "Informe um celular válido com DDD",
      });
    }

    const codigo = resolverCodigoClienteApi(consulta.cliente);
    if (!codigo) {
      return res.status(400).json({
        error: "Não foi possível identificar o código do seu cadastro no ERP.",
      });
    }

    let payloadAtualizacao;
    try {
      payloadAtualizacao = montarPayloadAtualizacao(
        {
          cpf: cpfNorm,
          email: emailNorm,
          celular: celularNorm,
        },
        consulta.cliente
      );
    } catch (err) {
      return res.status(400).json({ error: mensagemParaCliente(err.message) });
    }

    const atualizacao = await atualizarClienteApi(codigo, payloadAtualizacao);
    if (!atualizacao.ok) {
      return res.status(400).json({
        error: mensagemParaCliente(
          atualizacao.error ||
            "Não foi possível atualizar seu cadastro no ERP para ativar o clube"
        ),
      });
    }

    const atualizado = await buscarClientePorCpfCnpj(cpfNorm);
    const clienteFinal = atualizado.ok ? atualizado.cliente : consulta.cliente;
    const dadosFinais = atualizado.ok ? atualizado.raw : consulta.raw;

    const novo = await criarUsuario({
      cpf: cpfNorm,
      senha,
      clienteApi: clienteFinal,
      dadosApi: dadosFinais,
      registrarAceiteLegal: true,
    });

    await registrarEventoCliente({
      usuarioId: novo.id,
      cpf: cpfNorm,
      evento: EVENTOS_CLIENTE.CADASTRO_PLATAFORMA,
      sucesso: true,
      req,
      detalhes: {
        primeiroAcesso: true,
        aceiteLegal: true,
        clienteCodigo: novo.cliente_codigo,
        erpAtualizado: true,
        tipoCliente: "SM",
      },
    });

    await registrarEventoCliente({
      usuarioId: novo.id,
      cpf: cpfNorm,
      evento: EVENTOS_CLIENTE.LOGIN_SUCESSO,
      sucesso: true,
      req,
      detalhes: { primeiroAcesso: true },
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

router.get("/verificar-cpf/:cpf", verificarCpfLimiter, async (req, res) => {
  const cpfNorm = normalizarCpfCnpj(req.params.cpf);

  if (!cpfDigitosValidos(cpfNorm)) {
    return res.status(400).json({ error: "Informe um CPF válido" });
  }

  try {
    const local = await buscarUsuarioPorCpf(cpfNorm);

    // Quem já tem conta na plataforma não depende do ERP para avançar ao login.
    if (local) {
      return res.json({
        existeNoSistema: true,
        cadastradoNaPlataforma: true,
      });
    }

    let consulta;
    try {
      consulta = await buscarClientePorCpfCnpj(cpfNorm);
    } catch (erpError) {
      console.error("[auth/verificar-cpf] ERP indisponível:", erpError.message);
      return res.status(503).json({
        error:
          "Cadastro temporariamente indisponível. Tente novamente em alguns minutos.",
        erpIndisponivel: true,
      });
    }

    return res.json({
      existeNoSistema: consulta.ok,
      cadastradoNaPlataforma: false,
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

  if (!cpfDigitosValidos(cpfNorm)) {
    return res.status(400).json({ error: "CPF inválido" });
  }

  if (!body.aceiteLegal) {
    return res.status(400).json({
      error: "É necessário aceitar o Regulamento e a Política de Privacidade",
      requerAceiteLegal: true,
    });
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

    const usuarioLocal = await buscarUsuarioPorCpf(cpfNorm);

    await registrarEventoCliente({
      usuarioId: usuarioLocal?.id ?? null,
      cpf: cpfNorm,
      evento: EVENTOS_CLIENTE.CADASTRO_CLUBE_API,
      sucesso: true,
      req,
      detalhes: {
        aceiteLegal: true,
        clienteCodigo: resultado.codigo ?? null,
      },
    });

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

router.post(
  "/recuperar-senha/solicitar",
  recuperarSenhaSolicitarLimiter,
  async (req, res) => {
    const cpfNorm = normalizarCpfCnpj(req.body?.cpf);

    if (!cpfDigitosValidos(cpfNorm)) {
      return res.status(400).json({ error: "Informe um CPF válido" });
    }

    try {
      const resultado = await solicitarRecuperacaoSenha({
        cpf: cpfNorm,
        ip: req.ip,
      });
      return res.json(resultado);
    } catch (error) {
      console.error("[auth/recuperar-senha/solicitar]", error.message);
      return res.json({
        success: true,
        message: mensagemRecuperacaoGenerica(),
      });
    }
  }
);

router.post(
  "/recuperar-senha/redefinir",
  recuperarSenhaRedefinirLimiter,
  async (req, res) => {
    const { token, cpf, codigo, novaSenha, confirmacaoSenha } = req.body || {};

    const senhaOk = validarSenhaCadastro(novaSenha);
    if (!senhaOk.ok) {
      return res.status(400).json({ error: senhaOk.error });
    }

    if (String(novaSenha || "") !== String(confirmacaoSenha || "")) {
      return res.status(400).json({ error: "A confirmação da senha não confere" });
    }

    try {
      const resultado = await redefinirSenhaComRecuperacao({
        token,
        cpf,
        codigo,
        novaSenha,
      });

      if (!resultado.ok) {
        return res.status(resultado.status || 400).json({ error: resultado.error });
      }

      await registrarEventoCliente({
        usuarioId: resultado.usuario.id,
        cpf: resultado.usuario.cpf,
        evento: EVENTOS_CLIENTE.SENHA_RECUPERADA,
        sucesso: true,
        req,
        detalhes: {
          metodo: token ? "link" : "codigo",
        },
      });

      return res.json({
        success: true,
        message: "Senha redefinida com sucesso. Faça login com a nova senha.",
      });
    } catch (error) {
      console.error("[auth/recuperar-senha/redefinir]", error.message);
      return res.status(500).json({
        error: mensagemParaCliente(error.message),
      });
    }
  }
);

export default router;
