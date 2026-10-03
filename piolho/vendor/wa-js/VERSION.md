# wa-js vendorizado

Biblioteca: `@wppconnect/wa-js` (licença Apache 2.0, ver `LICENSE` e `wppconnect-wa.js.LICENSE.txt`).

No piolho, esta pasta foi copiada sem alterações da extensão de referência
(`https://github.com/Carlos-GestaoLife/extrator_contatos`, pasta `vendor/wa-js/`, commit `d180226`),
que por sua vez baixou os arquivos do tarball oficial do npm descrito abaixo. Mesma versão e mesmo
SHA-256 nos dois repositórios.

## Versão atual

| Campo | Valor |
|-------|-------|
| Versão | 4.6.0 |
| Publicação no npm | 2026-08-14 |
| Origem | tarball do npm: https://registry.npmjs.org/@wppconnect/wa-js/-/wa-js-4.6.0.tgz |
| Integridade do tarball (conferida contra `dist.integrity` do registro) | `sha512-epf+ucZO9c25dCaGraslVNHB1mRjid7rfijZhKbalXed/gbDzi6u69wdHCgPbcZW9McVpKmVW+3AzffI39p2SQ==` |
| SHA-256 de `wppconnect-wa.js` | `5bfb88027f14a4d8c9e319374e8bb4083201906881cf8c74f75789b32e4106bd` |
| `supportedWhatsappWeb` (declarado no bundle) | `>=2.3000.1038792969-alpha` |

Arquivos copiados do tarball:

- `package/dist/wppconnect-wa.js` -> `wppconnect-wa.js`
- `package/dist/wppconnect-wa.js.LICENSE.txt` -> `wppconnect-wa.js.LICENSE.txt`
- `package/LICENSE` -> `LICENSE`

## Histórico

| Data | Versão | Motivo |
|------|--------|--------|
| 2026-09-30 | 4.6.0 | Primeira vendorização (na extensão de referência). |
| 2026-10-03 | 4.6.0 | Copiado para o piolho na Etapa 1 (sem mudança de versão). |

## Como atualizar

1. Baixar o tarball da nova versão:
   `curl -sSLO https://registry.npmjs.org/@wppconnect/wa-js/-/wa-js-<versao>.tgz`
2. Conferir a integridade: comparar
   `openssl dgst -sha512 -binary wa-js-<versao>.tgz | base64 -w0`
   com o campo `dist.integrity` de `curl -sS https://registry.npmjs.org/@wppconnect/wa-js/<versao>`.
3. Extrair (`tar xzf wa-js-<versao>.tgz`) e copiar os 3 arquivos listados acima para esta pasta.
4. Conferir nos tipos (`package/dist/**/*.d.ts`) se as APIs usadas em `src/main-world/adapter.ts`
   continuam existindo com a mesma assinatura.
5. Atualizar este arquivo: tabela "Versão atual" (versão, data, integridade, SHA-256,
   `supportedWhatsappWeb`) e uma linha nova no "Histórico" com o motivo.
6. Rodar `npm run build`.
7. Recarregar a extensão em `chrome://extensions`, recarregar o WhatsApp Web e conferir no
   console da aba: `WPP.isReady === true`. Depois conferir no side panel o banner "Conectado ao
   WhatsApp." com o número detectado.

Nunca carregar o wa-js de CDN nem por `import` remoto.
