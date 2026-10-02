import { exigirPapel } from "@/lib/sessao";

// Telas exclusivas da gestão (Origens, Painel, Saúde, Usuários e números, Dispositivos).
// Comercial que acessar qualquer uma delas volta para o início com ?erro=sem-permissao.
//
// Atenção: por causa da renderização parcial do Next, um layout não é reexecutado em toda
// navegação e não impede que a página abaixo dele rode. Por isso cada página (e cada Server
// Action ou consulta com dados da gestão) também chama exigirPapel("gestao"). A sessão é lida
// uma vez só por requisição (obterSessao usa cache), então repetir a checagem é barato.
export default async function LayoutGestao({ children }: { children: React.ReactNode }) {
  await exigirPapel("gestao");
  return children;
}
