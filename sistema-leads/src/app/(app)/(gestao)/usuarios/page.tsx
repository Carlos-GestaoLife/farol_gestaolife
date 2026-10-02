import { asc } from "drizzle-orm";
import type { Metadata } from "next";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { db } from "@/db";
import { numeros, user } from "@/db/schema";
import { formatarDataHora, formatarTelefone } from "@/lib/formatacao";
import { papelDe } from "@/lib/papeis";
import { exigirPapel } from "@/lib/sessao";
import {
  FormularioNovoNumero,
  FormularioNovoUsuario,
  LinhaNumero,
  LinhaUsuario,
} from "./componentes";

export const metadata: Metadata = { title: "Usuários e números | Sistema de Leads Gestão Life" };

export default async function PaginaUsuarios() {
  const sessao = await exigirPapel("gestao");

  const usuarios = await db
    .select({
      id: user.id,
      nome: user.name,
      email: user.email,
      papel: user.papel,
      criadoEm: user.createdAt,
    })
    .from(user)
    .orderBy(asc(user.name));
  const listaNumeros = await db
    .select({
      numero: numeros.numero,
      apelido: numeros.apelido,
      papel: numeros.papel,
      usuarioId: numeros.usuarioId,
    })
    .from(numeros)
    .orderBy(asc(numeros.numero));
  const opcoesUsuario = usuarios.map((u) => ({ id: u.id, nome: u.nome }));

  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Usuários e números</h1>
        <p className="text-muted-foreground text-sm">
          Quem acessa o sistema e quais números de WhatsApp são monitorados pelo piolho.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Usuários</CardTitle>
          <CardDescription>
            Cadastro fechado: só a gestão cria usuários. Troca de papel vale em até 5 minutos.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead>E-mail</TableHead>
                <TableHead>Papel</TableHead>
                <TableHead>Criado em</TableHead>
                <TableHead>Redefinir senha</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {usuarios.map((u) => (
                <LinhaUsuario
                  key={u.id}
                  ehVoce={u.id === sessao.user.id}
                  usuario={{
                    ...u,
                    papel: papelDe(u.papel),
                    criadoEm: formatarDataHora(u.criadoEm),
                  }}
                />
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Novo usuário</CardTitle>
          <CardDescription>
            Passe a senha inicial para a pessoa por um canal seguro.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormularioNovoUsuario />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Números monitorados</CardTitle>
          <CardDescription>
            Números novos também entram sozinhos quando um dispositivo manda sinal. Defina aqui o
            apelido, o papel e o usuário responsável.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {listaNumeros.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nenhum número cadastrado ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Apelido</TableHead>
                  <TableHead>Papel</TableHead>
                  <TableHead>Usuário</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {listaNumeros.map((n) => (
                  <LinhaNumero
                    key={n.numero}
                    numero={{ ...n, formatado: formatarTelefone(n.numero) }}
                    usuarios={opcoesUsuario}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Adicionar número</CardTitle>
          <CardDescription>
            O telefone é gravado na forma canônica (com DDI 55 e nono dígito).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <FormularioNovoNumero usuarios={opcoesUsuario} />
        </CardContent>
      </Card>
    </div>
  );
}
