import { asc, eq } from "drizzle-orm";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { dispositivos, user } from "@/db/schema";
import { formatarDataHora, formatarTelefone } from "@/lib/formatacao";
import { exigirPapel } from "@/lib/sessao";
import { FormularioNovoDispositivo, LinhaDispositivo } from "./componentes";

export const metadata: Metadata = { title: "Dispositivos | Sistema de Leads Gestão Life" };

export default async function PaginaDispositivos() {
  await exigirPapel("gestao");

  const lista = await db
    .select({
      id: dispositivos.id,
      nome: dispositivos.nome,
      usuario: user.name,
      numeroDetectado: dispositivos.numeroDetectado,
      ultimoSinalEm: dispositivos.ultimoSinalEm,
      ultimoSyncEm: dispositivos.ultimoSyncEm,
      filaPendente: dispositivos.filaPendente,
      versaoExtensao: dispositivos.versaoExtensao,
      ativo: dispositivos.ativo,
    })
    .from(dispositivos)
    .leftJoin(user, eq(dispositivos.usuarioId, user.id))
    .orderBy(asc(dispositivos.nome));
  const usuarios = await db
    .select({ id: user.id, nome: user.name })
    .from(user)
    .orderBy(asc(user.name));

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Dispositivos</h1>
        <p className="text-muted-foreground text-sm">
          Computadores com o piolho instalado. Cada um tem o seu token; no sistema fica guardado só
          o hash dele.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dispositivos cadastrados</CardTitle>
          <CardDescription>
            Último sinal e fila pendente chegam pelo heartbeat do piolho.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {lista.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum dispositivo cadastrado ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead>Número detectado</TableHead>
                  <TableHead>Último sinal</TableHead>
                  <TableHead>Último sync</TableHead>
                  <TableHead className="text-right">Fila</TableHead>
                  <TableHead>Versão</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.map((d) => (
                  <LinhaDispositivo
                    key={d.id}
                    dispositivo={{
                      id: d.id,
                      nome: d.nome,
                      usuario: d.usuario,
                      numeroDetectado: d.numeroDetectado
                        ? formatarTelefone(d.numeroDetectado)
                        : null,
                      ultimoSinal: formatarDataHora(d.ultimoSinalEm),
                      ultimoSync: formatarDataHora(d.ultimoSyncEm),
                      filaPendente: d.filaPendente,
                      versaoExtensao: d.versaoExtensao,
                      ativo: d.ativo,
                    }}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Novo dispositivo</CardTitle>
          <CardDescription>
            O token aparece uma única vez, logo depois de criar. Copie e cole no piolho.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormularioNovoDispositivo usuarios={usuarios} />
        </CardContent>
      </Card>
    </div>
  );
}
