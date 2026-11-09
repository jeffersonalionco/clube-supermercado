import test from "node:test";
import assert from "node:assert/strict";
import {
  acessoDeArmazenamento,
  menuLiberado,
  podeGerirAdmins,
  primeiroMenu,
  subLiberado,
  temFerramenta,
} from "../../shared/permissoesAdmin.js";
import { ferramentasExigidas } from "../services/permissoesRotas.js";

test("lista vazia no banco não é acesso completo", () => {
  const acesso = acessoDeArmazenamento([]);
  assert.equal(acesso.acessoTotal, false);
  assert.deepEqual(acesso.ferramentas, []);
  assert.equal(menuLiberado(acesso, "marketing"), false);
  assert.equal(menuLiberado(acesso, "manual"), true);
  assert.equal(primeiroMenu(acesso), "manual");
});

test("nulo no banco continua com o painel inteiro", () => {
  const acesso = acessoDeArmazenamento(null);
  assert.equal(acesso.acessoTotal, true);
  assert.equal(temFerramenta(acesso, ["config.backup"]), true);
  assert.equal(menuLiberado(acesso, "admins"), true);
  assert.equal(podeGerirAdmins({ ativo: true, ferramentas: null }), true);
});

test("ferramenta marcada libera só o menu e a tela dela", () => {
  const acesso = acessoDeArmazenamento(["marketing.whatsapp-caixa"]);
  assert.equal(menuLiberado(acesso, "marketing"), true);
  assert.equal(subLiberado(acesso, "marketing", "whatsapp-caixa"), true);
  assert.equal(subLiberado(acesso, "marketing", "email"), false);
  assert.equal(menuLiberado(acesso, "backup"), false);
  assert.equal(primeiroMenu(acesso), "marketing");
});

test("id desconhecido é ignorado", () => {
  const acesso = acessoDeArmazenamento(["marketing.email", "nao.existe"]);
  assert.deepEqual(acesso.ferramentas, ["marketing.email"]);
});

test("rotas de marketing exigem a ferramenta certa", () => {
  assert.deepEqual(
    ferramentasExigidas("marketing", "GET", "/whatsapp/caixa/conversas"),
    ["marketing.whatsapp-caixa"]
  );
  assert.ok(
    ferramentasExigidas("marketing", "GET", "/campanhas").includes("marketing.email")
  );
  assert.deepEqual(
    ferramentasExigidas("marketing", "POST", "/whatsapp/contatos/backfill"),
    ["marketing.whatsapp-contatos"]
  );
  const caixa = acessoDeArmazenamento(["marketing.whatsapp-caixa"]);
  assert.equal(
    temFerramenta(caixa, ferramentasExigidas("marketing", "GET", "/whatsapp/caixa/conversas")),
    true
  );
  assert.equal(
    temFerramenta(caixa, ferramentasExigidas("marketing", "GET", "/campanhas")),
    false
  );
  assert.equal(temFerramenta(caixa, ferramentasExigidas("admin", "GET", "/backup")), false);
  assert.equal(
    temFerramenta(acessoDeArmazenamento(null), ferramentasExigidas("admin", "GET", "/backup")),
    true
  );
});

test("baixa de pontos e ficha do cliente não compartilham a mesma rota", () => {
  assert.deepEqual(ferramentasExigidas("admin", "GET", "/clientes/123/pontos"), [
    "operacao.pontos",
  ]);
  assert.deepEqual(ferramentasExigidas("admin", "GET", "/clientes/123/ficha"), [
    "principal.clientes",
  ]);
  assert.equal(ferramentasExigidas("admin", "GET", "/eu"), null);
  assert.equal(
    ferramentasExigidas("admin", "GET", "/marketing/whatsapp/caixa/conversas"),
    null
  );
});

test("último gestor é quem tem acesso completo ou a ferramenta Administradores", () => {
  assert.equal(podeGerirAdmins({ ativo: true, acessoTotal: true, ferramentas: null }), true);
  assert.equal(
    podeGerirAdmins({ ativo: true, acessoTotal: false, ferramentas: ["config.admins"] }),
    true
  );
  assert.equal(
    podeGerirAdmins({ ativo: false, acessoTotal: true, ferramentas: null }),
    false
  );
  assert.equal(
    podeGerirAdmins({ ativo: true, acessoTotal: false, ferramentas: ["marketing.email"] }),
    false
  );
});
