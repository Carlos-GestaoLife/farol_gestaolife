import { pgEnum } from "drizzle-orm/pg-core";

// Enums do Postgres. Nomes e valores seguem a seção "Modelo de dados" do CLAUDE.md.

export const papelUsuario = pgEnum("papel_usuario", ["gestao", "comercial"]);

export const fonteEntrada = pgEnum("fonte_entrada", [
  "whatsapp",
  "meta_lead",
  "framer",
  "hotmart",
  "manual",
  "outra",
]);

export const statusEntrada = pgEnum("status_entrada", ["pendente", "processado", "erro", "ignorado"]);

export const tipoIdentificador = pgEnum("tipo_identificador", [
  "telefone",
  "email",
  "wa_id",
  "meta_lead_id",
]);

export const tipoEvento = pgEnum("tipo_evento", [
  "form_enviado",
  "conversa_iniciada",
  "estagio_alterado",
  "responsavel_alterado",
  "reuniao_agendada",
  "ingresso_comprado",
  "checkin_evento",
  "venda_registrada",
  "identidade_mesclada",
  "nota",
]);

export const canalEvento = pgEnum("canal_evento", [
  "whatsapp",
  "meta_form",
  "lp_form",
  "hotmart",
  "presencial",
  "manual",
]);

export const direcaoMensagem = pgEnum("direcao_mensagem", ["in", "out"]);

export const tipoMidia = pgEnum("tipo_midia", [
  "texto",
  "audio",
  "imagem",
  "video",
  "documento",
  "figurinha",
  "localizacao",
  "contato",
  "outro",
]);

export const tipoOrigem = pgEnum("tipo_origem", [
  "anuncio_ctwa",
  "link_whatsapp",
  "qr_code",
  "form_meta",
  "lp",
  "organico",
  "indicacao",
  "desconhecida",
]);

export const tipoEstagio = pgEnum("tipo_estagio", ["aberto", "ganho", "perdido"]);

export const papelNumero = pgEnum("papel_numero", ["central", "sdr", "vendedor"]);

export const tipoRevisao = pgEnum("tipo_revisao", ["conflito_identidade", "outro"]);

export const statusRevisao = pgEnum("status_revisao", ["aberta", "resolvida", "descartada"]);

export const canalVenda = pgEnum("canal_venda", ["online", "presencial"]);

export const fonteVenda = pgEnum("fonte_venda", ["vendedor", "hotmart", "outra_plataforma"]);

export const statusConciliacao = pgEnum("status_conciliacao", ["pendente", "conciliada", "divergente"]);
