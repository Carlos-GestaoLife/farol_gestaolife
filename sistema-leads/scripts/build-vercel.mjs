// Comando de build do projeto na Vercel (npm run build:vercel).
// Em produção aplica as migrações versionadas, o seed idempotente e a criação do primeiro
// usuário gestao (idempotente; sem as variáveis PRIMEIRO_GESTAO_* só loga e segue) antes do
// next build.
// Se a migração, o seed ou a criação do usuário falhar, o build falha e a versão anterior continua no ar.
// Em preview e localmente o banco não é tocado.
import { spawnSync } from "node:child_process";

function rodar(comando, args) {
  console.log(`> ${comando} ${args.join(" ")}`);
  const resultado = spawnSync(comando, args, { stdio: "inherit", shell: process.platform === "win32" });
  if (resultado.error) {
    console.error(`Falha ao executar "${comando} ${args.join(" ")}":`, resultado.error.message);
    process.exit(1);
  }
  if (resultado.status !== 0) {
    console.error(`"${comando} ${args.join(" ")}" terminou com código ${resultado.status ?? "desconhecido"}.`);
    process.exit(1);
  }
}

const ambiente = process.env.VERCEL_ENV;

if (ambiente === "production") {
  console.log("Ambiente production: aplicando migrações, seed e primeiro usuário antes do build.");
  rodar("npm", ["run", "db:migrate"]);
  rodar("npm", ["run", "db:seed"]);
  rodar("npm", ["run", "db:criar-gestao"]);
} else {
  console.log(`Ambiente ${ambiente ?? "local"}: migração e seed pulados (só em produção).`);
}

rodar("npm", ["run", "build"]);
