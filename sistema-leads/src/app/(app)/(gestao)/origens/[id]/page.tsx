import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { carregarOrigem, listarNumerosOpcoes } from "@/consultas/origens";
import { formatarDataHora, formatarTelefone } from "@/lib/formatacao";
import { MAX_TEXTO_PREENCHIDO, ROTULO_TIPO_ORIGEM, TIPOS_COM_LINK } from "@/lib/origens";
import { exigirPapel } from "@/lib/sessao";
import { casaPadrao } from "@/nucleo/normalizacao";
import { BotaoAtivoOrigem, FormularioOrigem, GeradorLink } from "../componentes";

export const metadata: Metadata = { title: "Origem | Sistema de Leads Gestão Life" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function PaginaOrigem({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ texto?: string | string[] }>;
}) {
  await exigirPapel("gestao");
  const { id } = await params;
  const { texto } = await searchParams;
  if (!UUID.test(id)) notFound();
  const [origem, numeros] = await Promise.all([carregarOrigem(id), listarNumerosOpcoes()]);
  if (!origem) notFound();
  const comLink = TIPOS_COM_LINK.includes(origem.tipo);
  // Texto original digitado ao criar (só na URL, nunca gravado), se ainda casar com o padrão.
  const textoOriginal =
    typeof texto === "string" &&
    texto.length <= MAX_TEXTO_PREENCHIDO &&
    origem.padraoTexto &&
    casaPadrao(texto, origem.padraoTexto)
      ? texto
      : null;

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Link
          href="/origens"
          className="text-muted-foreground text-sm underline-offset-4 hover:underline"
        >
          Voltar para Origens
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{origem.nome}</h1>
          <Badge variant="secondary">{ROTULO_TIPO_ORIGEM[origem.tipo]}</Badge>
          {origem.ativo ? null : <Badge variant="outline">Inativa</Badge>}
          {origem.criadaAutomaticamente ? (
            <Badge variant="outline">Criada automaticamente</Badge>
          ) : null}
        </div>
        <div className="text-muted-foreground flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="font-mono">{origem.codigo}</span>
          <span>{`${origem.leads} lead(s) no primeiro toque`}</span>
          <span>{`${origem.toques} toque(s)`}</span>
          <span>{`Criada em ${formatarDataHora(origem.criadoEm)}`}</span>
          <BotaoAtivoOrigem id={origem.id} ativo={origem.ativo} />
        </div>
      </div>

      {comLink ? (
        <Card id="link">
          <CardHeader>
            <CardTitle>Link do WhatsApp e QR Code</CardTitle>
            <CardDescription>
              Escolha o número e gere o link com o texto pré-preenchido. Nada é gravado: gere de
              novo quando quiser outro número.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GeradorLink
              origemId={origem.id}
              codigo={origem.codigo}
              textoInicial={textoOriginal ?? origem.padraoTexto}
              numeros={numeros.map((n) => ({
                numero: n.numero,
                rotulo: n.apelido
                  ? `${n.apelido} (${formatarTelefone(n.numero)})`
                  : formatarTelefone(n.numero),
              }))}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Dados da origem</CardTitle>
          <CardDescription>
            Mudanças valem para os próximos toques. Toques já gravados mantêm a origem que
            receberam.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormularioOrigem
            textoOriginal={textoOriginal}
            origem={{
              id: origem.id,
              codigo: origem.codigo,
              nome: origem.nome,
              tipo: origem.tipo,
              padraoTexto: origem.padraoTexto,
              metaCampaignId: origem.metaCampaignId,
              metaAdsetId: origem.metaAdsetId,
              metaAdId: origem.metaAdId,
              metaFormId: origem.metaFormId,
              utmSource: origem.utmSource,
              utmMedium: origem.utmMedium,
              utmCampaign: origem.utmCampaign,
              cidade: origem.cidade,
              evento: origem.evento,
              produto: origem.produto,
              ativo: origem.ativo,
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
