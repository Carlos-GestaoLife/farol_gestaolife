import { MessageSquare, StickyNote } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  LIMITE_ITENS_LINHA_DO_TEMPO,
  carregarLinhaDoTempo,
  carregarPessoa,
  listarIdentificadores,
  type ItemLinhaDoTempo,
} from "@/consultas/linha-do-tempo";
import { listarEstagios, listarUsuariosOpcoes } from "@/consultas/pessoas";
import { primeiroEUltimoToque, type Toque } from "@/consultas/toques";
import { formatarDataHora, formatarDia, formatarTelefone } from "@/lib/formatacao";
import { exigirSessao } from "@/lib/sessao";
import {
  BotaoOptOut,
  FormularioNome,
  FormularioNota,
  SeletorEstagio,
  SeletorResponsavel,
} from "./componentes";

export const metadata: Metadata = { title: "Pessoa | Sistema de Leads Gestão Life" };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ROTULO_IDENTIFICADOR = {
  telefone: "Telefone",
  email: "E-mail",
  wa_id: "WhatsApp (wa_id)",
  meta_lead_id: "Lead da Meta",
} as const;

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1">
      <span className="text-sm leading-none font-medium">{rotulo}</span>
      <span className="text-muted-foreground text-sm">{children}</span>
    </div>
  );
}

function DescricaoToque({ rotulo, toque }: { rotulo: string; toque: Toque | null }) {
  return (
    <p>
      <span className="font-medium">{`${rotulo}: `}</span>
      <span className="text-muted-foreground">
        {toque ? `${toque.origem.nome} (${formatarDataHora(toque.ocorridoEm)})` : "sem origem"}
      </span>
    </p>
  );
}

function ItemTempo({ item }: { item: ItemLinhaDoTempo }) {
  if (item.tipo === "mensagens") {
    const { dia } = item;
    return (
      <li className="flex gap-3">
        <MessageSquare className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
        <div className="grid min-w-0 gap-1">
          <p className="text-sm font-medium">
            {`Mensagens em ${formatarDia(dia.dia)}`}
            <span className="text-muted-foreground font-normal">
              {` no número ${formatarTelefone(dia.numeroMonitorado)}`}
            </span>
          </p>
          <p className="text-sm">{item.resumo}</p>
          {dia.textosAbertura.map((t, i) => (
            <p key={i} className="text-muted-foreground text-xs break-words">
              <span className="font-medium">Texto de abertura: </span>
              {t}
            </p>
          ))}
        </div>
      </li>
    );
  }
  const { descricao } = item;
  return (
    <li className="flex gap-3">
      <StickyNote className="text-muted-foreground mt-0.5 size-4 shrink-0" aria-hidden />
      <div className="grid min-w-0 gap-1">
        <p className="text-sm font-medium">{descricao.titulo}</p>
        <p className="text-muted-foreground text-xs">
          {formatarDataHora(item.em)}
          {descricao.autor ? ` ${descricao.autor}` : ""}
        </p>
        {descricao.detalhes.map((d, i) => (
          <p key={i} className="text-sm break-words whitespace-pre-line">
            {d}
          </p>
        ))}
        {descricao.textoAbertura ? (
          <p className="text-muted-foreground text-xs break-words">
            <span className="font-medium">Texto de abertura: </span>
            {descricao.textoAbertura}
          </p>
        ) : null}
      </div>
    </li>
  );
}

export default async function PaginaPessoa({ params }: { params: Promise<{ id: string }> }) {
  await exigirSessao();
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const resultado = await carregarPessoa(id);
  if (resultado.tipo === "nao_encontrada") notFound();
  if (resultado.tipo === "mesclada") redirect(`/pessoas/${resultado.sobreviventeId}`);
  const { pessoa } = resultado;

  const [ids, linhaDoTempo, estagios, usuarios, toques] = await Promise.all([
    listarIdentificadores(id),
    carregarLinhaDoTempo(id),
    listarEstagios(),
    listarUsuariosOpcoes(),
    primeiroEUltimoToque(id),
  ]);
  const telefone = ids.find((i) => i.tipo === "telefone")?.valor;
  const titulo = pessoa.nome || (telefone ? formatarTelefone(telefone) : null) || "Sem nome";

  return (
    <div className="grid gap-6">
      <div className="grid gap-2">
        <Link href="/leads" className="text-muted-foreground text-sm underline-offset-4 hover:underline">
          Voltar para Leads
        </Link>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
          {pessoa.estagioNome ? <Badge variant="secondary">{pessoa.estagioNome}</Badge> : null}
          {pessoa.optOut ? <Badge variant="destructive">Opt-out</Badge> : null}
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm" aria-label="Toques de origem">
          <DescricaoToque rotulo="Primeiro toque" toque={toques.primeiro} />
          <DescricaoToque rotulo="Último toque" toque={toques.ultimo} />
        </div>
        <nav className="flex flex-wrap gap-3 text-sm" aria-label="Seções">
          <a href="#dados" className="underline-offset-4 hover:underline">
            Dados
          </a>
          <a href="#linha-do-tempo" className="underline-offset-4 hover:underline">
            Linha do tempo
          </a>
          <a href="#identificadores" className="underline-offset-4 hover:underline">
            Identificadores
          </a>
        </nav>
      </div>

      <Card id="dados">
        <CardHeader>
          <CardTitle>Dados</CardTitle>
          <CardDescription>
            Mudanças de estágio, responsável e opt-out ficam na linha do tempo com o seu usuário.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <FormularioNome key={pessoa.nome ?? ""} pessoaId={pessoa.id} nome={pessoa.nome} />
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            <SeletorEstagio
              key={`estagio-${pessoa.estagioId}`}
              pessoaId={pessoa.id}
              nomePessoa={titulo}
              estagioId={pessoa.estagioId}
              estagios={estagios}
            />
            <SeletorResponsavel
              key={`responsavel-${pessoa.responsavelId}`}
              pessoaId={pessoa.id}
              responsavelId={pessoa.responsavelId}
              usuarios={usuarios}
            />
            <BotaoOptOut pessoaId={pessoa.id} optOut={pessoa.optOut} />
            <Campo rotulo="Primeiro contato">{formatarDataHora(pessoa.primeiroContatoEm)}</Campo>
            <Campo rotulo="Último contato">{formatarDataHora(pessoa.ultimoContatoEm)}</Campo>
            {pessoa.estagioTipo === "perdido" && pessoa.motivoPerda ? (
              <Campo rotulo="Motivo da perda">{pessoa.motivoPerda}</Campo>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card id="linha-do-tempo">
        <CardHeader>
          <CardTitle>Linha do tempo</CardTitle>
          <CardDescription>
            Eventos e mensagens do WhatsApp agregadas por dia, do mais recente para o mais
            antigo. O conteúdo das conversas não é guardado.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6">
          <FormularioNota pessoaId={pessoa.id} />
          {linhaDoTempo.truncada ? (
            <p role="status" className="text-muted-foreground rounded-md border px-3 py-2 text-xs">
              {`Mostrando os ${LIMITE_ITENS_LINHA_DO_TEMPO} itens mais recentes. Os mais antigos não aparecem aqui.`}
            </p>
          ) : null}
          {linhaDoTempo.itens.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nada registrado ainda.</p>
          ) : (
            <ol className="grid gap-5" aria-label="Itens da linha do tempo">
              {linhaDoTempo.itens.map((item) => (
                <ItemTempo key={`${item.tipo}-${item.id}`} item={item} />
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      <Card id="identificadores">
        <CardHeader>
          <CardTitle>Identificadores</CardTitle>
          <CardDescription>
            Valor normalizado (usado nas buscas) e como chegou originalmente.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ids.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum identificador.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Valor</TableHead>
                  <TableHead>Valor original</TableHead>
                  <TableHead>Desde</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ids.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell className="font-medium">{ROTULO_IDENTIFICADOR[i.tipo]}</TableCell>
                    <TableCell className="tabular-nums">
                      {i.tipo === "telefone" ? formatarTelefone(i.valor) : i.valor}
                    </TableCell>
                    <TableCell className="text-muted-foreground">{i.valorOriginal ?? ""}</TableCell>
                    <TableCell className="text-muted-foreground">{formatarDataHora(i.criadoEm)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
