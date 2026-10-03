// Formatação de exibição no painel.

/** "5562999998888" -> "+55 (62) 99999-8888"; fixo de 12 dígitos -> "+55 (62) 3234-5678"; resto -> "+dígitos". */
export function formatarTelefone(digitos: string): string {
  if (/^55\d{11}$/.test(digitos)) {
    return `+55 (${digitos.slice(2, 4)}) ${digitos.slice(4, 9)}-${digitos.slice(9)}`;
  }
  if (/^55\d{10}$/.test(digitos)) {
    return `+55 (${digitos.slice(2, 4)}) ${digitos.slice(4, 8)}-${digitos.slice(8)}`;
  }
  return `+${digitos}`;
}
