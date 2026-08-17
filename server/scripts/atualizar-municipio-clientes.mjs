/**
 * Atualiza o código de município (cidade) no ERP para membros da plataforma
 * que ainda estão com o padrão antigo (5) para o novo (5884).
 *
 * Uso:
 *   node scripts/atualizar-municipio-clientes.mjs
 *   node scripts/atualizar-municipio-clientes.mjs --dry-run
 */
import "../env.js";
import { initDatabase, getPool } from "../db.js";
import {
  atualizarClienteApi,
  buscarClientePorCpfCnpj,
} from "../services/apiClient.js";
import { montarPayloadAtualizacao } from "../services/cadastroCliente.js";
import { atualizarDadosUsuario } from "../services/usuarioService.js";

const CIDADE_ANTIGA = 5;
const CIDADE_NOVA = Number(process.env.CADASTRO_CIDADE || 5884);
const dryRun = process.argv.includes("--dry-run");

function cidadeDoCliente(cliente) {
  const res = cliente?.dadosResidenciais || cliente?.enderecoResidencial || {};
  const n = Number(res.cidade);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function atualizarUm(u, resumo) {
  const consulta = await buscarClientePorCpfCnpj(u.cpf);
  if (!consulta.ok || !consulta.cliente) {
    resumo.semErp += 1;
    console.log(`- ${u.cpf} ${u.nome || ""}: ERP não encontrado`);
    return;
  }

  const atual = cidadeDoCliente(consulta.cliente);
  if (atual === CIDADE_NOVA) {
    resumo.jaCerto += 1;
    return;
  }

  if (atual != null && atual !== CIDADE_ANTIGA) {
    console.log(
      `- ${u.cpf} ${u.nome || ""}: cidade ${atual} (não é o padrão antigo ${CIDADE_ANTIGA}) — mantido`
    );
    resumo.jaCerto += 1;
    return;
  }

  const codigo =
    consulta.cliente.codigo ??
    consulta.cliente.codigo_cliente ??
    u.cliente_codigo;

  if (!codigo) {
    resumo.falha += 1;
    console.log(`- ${u.cpf}: sem código ERP`);
    return;
  }

  const resEnd =
    consulta.cliente.dadosResidenciais ||
    consulta.cliente.enderecoResidencial ||
    {};

  let payload;
  try {
    payload = montarPayloadAtualizacao(
      {
        cpf: u.cpf,
        nome: u.nome,
        endereco: {
          uf: resEnd.uf,
          cep: resEnd.cep,
          cidade: CIDADE_NOVA,
          endereco: resEnd.endereco || resEnd.logradouro,
          bairro: resEnd.bairro,
          numero: resEnd.numero || resEnd.num,
          complemento: resEnd.complemento,
        },
      },
      consulta.cliente
    );
  } catch (err) {
    resumo.falha += 1;
    console.log(`- ${u.cpf} ${u.nome || ""}: payload inválido — ${err.message}`);
    return;
  }

  if (Number(payload.enderecoResidencial?.cidade) !== CIDADE_NOVA) {
    resumo.falha += 1;
    console.log(`- ${u.cpf}: payload não aplicou cidade ${CIDADE_NOVA}`);
    return;
  }

  if (dryRun) {
    resumo.ok += 1;
    resumo.atualizados.push({
      cpf: u.cpf,
      nome: u.nome,
      de: atual,
      para: CIDADE_NOVA,
    });
    console.log(
      `- ${u.cpf} ${u.nome || ""}: ${atual ?? "vazio"} → ${CIDADE_NOVA} (dry-run)`
    );
    return;
  }

  const resultado = await atualizarClienteApi(codigo, payload);
  if (!resultado.ok) {
    resumo.falha += 1;
    console.log(`- ${u.cpf} ${u.nome || ""}: falha ERP — ${resultado.error}`);
    return;
  }

  const atualizado = await buscarClientePorCpfCnpj(u.cpf);
  if (atualizado.ok) {
    await atualizarDadosUsuario(u.id, {
      dadosApi: atualizado.raw,
      clienteCodigo: codigo,
    });
  }

  resumo.ok += 1;
  resumo.atualizados.push({
    cpf: u.cpf,
    nome: u.nome,
    de: atual,
    para: CIDADE_NOVA,
  });
  console.log(`- ${u.cpf} ${u.nome || ""}: ${atual ?? "vazio"} → ${CIDADE_NOVA} OK`);
}

async function main() {
  await initDatabase();
  const pool = getPool();

  const { rows } = await pool.query(
    `SELECT id, cpf, cliente_codigo, nome
     FROM usuario
     ORDER BY id`
  );

  console.log(
    `Membros na plataforma: ${rows.length}. Destino cidade=${CIDADE_NOVA}. ${dryRun ? "(dry-run)" : ""}`
  );

  const resumo = {
    ok: 0,
    jaCerto: 0,
    semErp: 0,
    falha: 0,
    atualizados: [],
  };

  for (const u of rows) {
    try {
      await atualizarUm(u, resumo);
    } catch (err) {
      resumo.falha += 1;
      console.log(`- ${u.cpf} ${u.nome || ""}: erro — ${err.message}`);
    }
  }

  console.log("\nResumo:", JSON.stringify(resumo, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
