// Ícones do painel (sem biblioteca), copiados da extensão de referência. Decorativos: aria-hidden.

export function Alerta({ tamanho = 12 }: { tamanho?: number }) {
  return (
    <svg
      className="icone"
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}

/** Spinner circular (borda de 2px com o topo colorido). O tom define as cores via CSS. */
export function Spinner({ tamanho = 12, tom = "azul" }: { tamanho?: number; tom?: "azul" | "aviso" | "cinza" }) {
  return <span className={`spinner spinner--${tom}`} style={{ width: tamanho, height: tamanho }} aria-hidden="true" />;
}
