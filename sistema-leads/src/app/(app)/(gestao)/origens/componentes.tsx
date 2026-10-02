"use client";

import { Download } from "lucide-react";
import { useActionState } from "react";
import { MensagemAcao } from "@/components/app/mensagem-acao";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { ESTADO_INICIAL, type EstadoAcao } from "@/lib/acoes";
import { MAX_TEXTO_PREENCHIDO, ROTULO_TIPO_ORIGEM, TIPOS_ORIGEM } from "@/lib/origens";
import {
  alterarAtivoOrigem,
  gerarLinkEQr,
  recalcularPrimeiroToque,
  salvarOrigem,
  type EstadoLink,
} from "./acoes";

export type OrigemEditavel = {
  id: string;
  codigo: string;
  nome: string;
  tipo: string;
  padraoTexto: string | null;
  metaCampaignId: string | null;
  metaAdsetId: string | null;
  metaAdId: string | null;
  metaFormId: string | null;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  cidade: string | null;
  evento: string | null;
  produto: string | null;
  ativo: boolean;
};

function Campo({
  id,
  rotulo,
  ajuda,
  children,
}: {
  id: string;
  rotulo: string;
  ajuda?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid content-start gap-2">
      <Label htmlFor={id}>{rotulo}</Label>
      {children}
      {ajuda ? <p className="text-muted-foreground text-xs">{ajuda}</p> : null}
    </div>
  );
}

/** Formulário de criação (sem `origem`) ou edição de uma origem. */
export function FormularioOrigem({
  origem,
  textoOriginal,
}: {
  origem?: OrigemEditavel;
  /** Texto original digitado ao criar (com acentos), quando disponível. */
  textoOriginal?: string | null;
}) {
  const [estado, acao, pendente] = useActionState(salvarOrigem, ESTADO_INICIAL);
  // Depois de um erro, o formulário volta com o que foi enviado; senão, com o que está salvo.
  const v = (campo: string, salvo: string | null | undefined) =>
    estado.valores?.[campo] ?? salvo ?? "";
  const chave = estado.valores ? JSON.stringify(estado.valores) : "salvo";
  const ativo = estado.valores ? estado.valores.ativo === "on" : (origem?.ativo ?? true);

  return (
    <form key={chave} action={acao} className="grid gap-6">
      {origem ? <input type="hidden" name="id" value={origem.id} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Campo
          id="origem-codigo"
          rotulo="Código"
          ajuda="Único, minúsculo e sem espaços. É o valor do campo oculto origem das LPs."
        >
          <Input
            id="origem-codigo"
            name="codigo"
            required
            maxLength={80}
            placeholder="ex.: gnv-maceio-2026"
            defaultValue={v("codigo", origem?.codigo)}
          />
        </Campo>
        <Campo id="origem-nome" rotulo="Nome">
          <Input
            id="origem-nome"
            name="nome"
            required
            maxLength={120}
            placeholder="ex.: Gestão na Veia Maceió (link)"
            defaultValue={v("nome", origem?.nome)}
          />
        </Campo>
        <Campo id="origem-tipo" rotulo="Tipo">
          <NativeSelect
            id="origem-tipo"
            name="tipo"
            className="w-full"
            defaultValue={v("tipo", origem?.tipo) || "link_whatsapp"}
          >
            {TIPOS_ORIGEM.map((t) => (
              <NativeSelectOption key={t} value={t}>
                {ROTULO_TIPO_ORIGEM[t]}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Campo>
      </div>

      <Campo
        id="origem-texto"
        rotulo="Texto pré-preenchido (WhatsApp)"
        ajuda={
          "Digite como a pessoa vai enviar, com acentos. O sistema grava a forma normalizada " +
          "(minúsculo, sem acento, sem emoji e com espaços colapsados) e atribui a esta origem " +
          "as conversas cuja primeira mensagem é igual ao texto ou começa com ele."
        }
      >
        <Textarea
          id="origem-texto"
          name="texto_preenchido"
          maxLength={MAX_TEXTO_PREENCHIDO}
          rows={2}
          placeholder="ex.: Olá! Quero saber do Gestão na Veia Maceió"
          defaultValue={v("texto_preenchido", textoOriginal ?? origem?.padraoTexto)}
        />
        {origem?.padraoTexto ? (
          <p className="text-muted-foreground text-xs">
            Padrão gravado (normalizado): <span className="font-mono">{origem.padraoTexto}</span>
          </p>
        ) : null}
      </Campo>

      <fieldset className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <legend className="mb-2 text-sm font-medium">Meta (anúncios e formulários)</legend>
        <Campo id="origem-ad" rotulo="Id do anúncio">
          <Input
            id="origem-ad"
            name="meta_ad_id"
            inputMode="numeric"
            defaultValue={v("meta_ad_id", origem?.metaAdId)}
          />
        </Campo>
        <Campo id="origem-form" rotulo="Id do formulário">
          <Input
            id="origem-form"
            name="meta_form_id"
            inputMode="numeric"
            defaultValue={v("meta_form_id", origem?.metaFormId)}
          />
        </Campo>
        <Campo id="origem-adset" rotulo="Id do conjunto">
          <Input
            id="origem-adset"
            name="meta_adset_id"
            inputMode="numeric"
            defaultValue={v("meta_adset_id", origem?.metaAdsetId)}
          />
        </Campo>
        <Campo id="origem-campanha" rotulo="Id da campanha">
          <Input
            id="origem-campanha"
            name="meta_campaign_id"
            inputMode="numeric"
            defaultValue={v("meta_campaign_id", origem?.metaCampaignId)}
          />
        </Campo>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-medium">
          UTMs das LPs (campo vazio vale para qualquer valor; preencha source ou campaign)
        </legend>
        <Campo id="origem-utm-source" rotulo="utm_source">
          <Input
            id="origem-utm-source"
            name="utm_source"
            maxLength={120}
            defaultValue={v("utm_source", origem?.utmSource)}
          />
        </Campo>
        <Campo id="origem-utm-medium" rotulo="utm_medium">
          <Input
            id="origem-utm-medium"
            name="utm_medium"
            maxLength={120}
            defaultValue={v("utm_medium", origem?.utmMedium)}
          />
        </Campo>
        <Campo id="origem-utm-campaign" rotulo="utm_campaign">
          <Input
            id="origem-utm-campaign"
            name="utm_campaign"
            maxLength={200}
            defaultValue={v("utm_campaign", origem?.utmCampaign)}
          />
        </Campo>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-3">
        <Campo id="origem-cidade" rotulo="Cidade">
          <Input
            id="origem-cidade"
            name="cidade"
            maxLength={120}
            defaultValue={v("cidade", origem?.cidade)}
          />
        </Campo>
        <Campo id="origem-evento" rotulo="Evento">
          <Input
            id="origem-evento"
            name="evento"
            maxLength={120}
            defaultValue={v("evento", origem?.evento)}
          />
        </Campo>
        <Campo id="origem-produto" rotulo="Produto">
          <Input
            id="origem-produto"
            name="produto"
            maxLength={120}
            defaultValue={v("produto", origem?.produto)}
          />
        </Campo>
      </div>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="ativo"
          defaultChecked={ativo}
          className="accent-primary size-4"
        />
        Ativa (origens inativas não recebem atribuições novas)
      </label>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando..." : origem ? "Salvar origem" : "Criar origem"}
        </Button>
        <MensagemAcao estado={estado} />
      </div>
    </form>
  );
}

/** Botão que ativa ou desativa a origem. */
export function BotaoAtivoOrigem({ id, ativo }: { id: string; ativo: boolean }) {
  const [estado, acao, pendente] = useActionState(alterarAtivoOrigem, ESTADO_INICIAL);
  return (
    <form action={acao} className="grid gap-1">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="ativo" value={ativo ? "false" : "true"} />
      <Button type="submit" variant="outline" size="sm" disabled={pendente}>
        {ativo ? "Desativar" : "Ativar"}
      </Button>
      <MensagemAcao estado={estado} className="max-w-40 text-xs" />
    </form>
  );
}

export function BotaoRecalcular() {
  const [estado, acao, pendente] = useActionState<EstadoAcao>(
    () => recalcularPrimeiroToque(),
    ESTADO_INICIAL,
  );
  return (
    <form action={acao} className="flex flex-wrap items-center gap-3">
      <Button type="submit" variant="outline" disabled={pendente}>
        {pendente ? "Recalculando..." : "Recalcular primeiro toque"}
      </Button>
      <MensagemAcao estado={estado} />
    </form>
  );
}

const ESTADO_LINK_INICIAL: EstadoLink = { ok: false, mensagem: null };

/** Gera o link do WhatsApp com texto pré-preenchido e o QR Code (nada é gravado). */
export function GeradorLink({
  origemId,
  codigo,
  textoInicial,
  numeros,
}: {
  origemId: string;
  codigo: string;
  /** Texto sugerido: o original digitado ao criar ou, sem ele, o padrão normalizado. */
  textoInicial: string | null;
  numeros: { numero: string; rotulo: string }[];
}) {
  const [estado, acao, pendente] = useActionState(gerarLinkEQr, ESTADO_LINK_INICIAL);
  const v = estado.valores;

  if (numeros.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nenhum número cadastrado. Adicione um em Usuários e números.
      </p>
    );
  }

  return (
    <div className="grid gap-6">
      <form action={acao} className="grid gap-4 sm:grid-cols-2">
        <input type="hidden" name="origemId" value={origemId} />
        <Campo id="link-numero" rotulo="Número de destino">
          <NativeSelect
            id="link-numero"
            name="numero"
            className="w-full"
            defaultValue={v?.numero ?? numeros[0].numero}
          >
            {numeros.map((n) => (
              <NativeSelectOption key={n.numero} value={n.numero}>
                {n.rotulo}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Campo>
        <Campo
          id="link-texto"
          rotulo="Texto da mensagem"
          ajuda="Pode ter acentos e emoji, mas precisa começar com o padrão da origem."
        >
          <Textarea
            id="link-texto"
            name="texto"
            rows={2}
            maxLength={MAX_TEXTO_PREENCHIDO}
            defaultValue={v?.texto ?? textoInicial ?? ""}
          />
        </Campo>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" disabled={pendente}>
            {pendente ? "Gerando..." : "Gerar link e QR"}
          </Button>
          <MensagemAcao estado={estado} />
        </div>
      </form>

      {estado.ok && estado.linkWhatsapp && estado.svg ? (
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
          <div className="grid gap-2">
            <Label htmlFor="link-gerado">Link</Label>
            <Input id="link-gerado" readOnly value={estado.linkWhatsapp} className="font-mono" />
            <a
              href={estado.linkWhatsapp}
              target="_blank"
              rel="noreferrer"
              className="text-sm underline-offset-4 hover:underline"
            >
              Abrir no WhatsApp
            </a>
          </div>
          <div className="grid justify-items-center gap-2">
            <div
              data-testid="qr-code"
              role="img"
              aria-label="QR Code do link"
              className="size-48 rounded-md border bg-white p-1 [&>svg]:size-full"
              // SVG gerado no servidor pela biblioteca qrcode (só formas, sem texto do usuário).
              dangerouslySetInnerHTML={{ __html: estado.svg }}
            />
            <Button asChild variant="outline" size="sm">
              <a
                href={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(estado.svg)}`}
                download={`qr-${codigo}.svg`}
              >
                <Download />
                Baixar QR Code (SVG)
              </a>
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
