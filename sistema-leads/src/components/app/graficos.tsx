// Gráficos simples em SVG feito à mão (sem biblioteca), para o Painel. Uma série só, na cor
// `--grafico-serie` (azul validado para tema claro e escuro, ver globals.css). Texto sempre nas
// cores de texto, nunca na cor da série. Barras finas, ponta arredondada (4px) e base reta.
// Passar o mouse mostra o valor (<title>); cada gráfico tem também a tabela com os números.

const RAIO = 4;

/** Caminho de uma barra horizontal com a ponta direita arredondada e a base (esquerda) reta. */
function barraHorizontal(x: number, y: number, largura: number, altura: number): string {
  if (largura <= 0) return "";
  const r = Math.min(RAIO, largura, altura / 2);
  return `M${x},${y}h${largura - r}a${r},${r} 0 0 1 ${r},${r}v${altura - 2 * r}a${r},${r} 0 0 1 ${-r},${r}h${-(largura - r)}z`;
}

/** Caminho de uma coluna com o topo arredondado e a base reta. */
function coluna(x: number, base: number, largura: number, altura: number): string {
  if (altura <= 0) return "";
  const r = Math.min(RAIO, largura / 2, altura);
  return `M${x},${base}v${-(altura - r)}a${r},${r} 0 0 1 ${r},${-r}h${largura - 2 * r}a${r},${r} 0 0 1 ${r},${r}v${altura - r}z`;
}

function cortar(texto: string, max: number): string {
  return texto.length > max ? `${texto.slice(0, max - 1)}…` : texto;
}

const numero = new Intl.NumberFormat("pt-BR");

export type ItemBarra = { rotulo: string; valor: number; /** Texto ao lado da barra (padrão: o valor). */ texto?: string; dica?: string };

/**
 * Barras horizontais (magnitude por categoria, já ordenadas por quem chama), com o rótulo à
 * esquerda e o valor na ponta da barra.
 */
export function BarrasHorizontais({
  itens,
  titulo,
  maximo,
}: {
  itens: ItemBarra[];
  /** Descrição acessível do gráfico. */
  titulo: string;
  /** Valor que ocupa a largura toda (padrão: o maior valor). */
  maximo?: number;
}) {
  if (itens.length === 0) return null;
  // Largura pensada para meio card (~440px): o SVG não cresce além dela, então o texto fica
  // no tamanho real em vez de ser ampliado ou encolhido.
  const largura = 440;
  const linha = 28;
  const espessura = 16;
  const areaRotulo = 150;
  const areaValor = 76;
  const larguraBarras = largura - areaRotulo - areaValor;
  const max = Math.max(maximo ?? 0, ...itens.map((i) => i.valor), 1);
  const altura = itens.length * linha;

  return (
    <svg
      viewBox={`0 0 ${largura} ${altura}`}
      className="h-auto w-full"
      style={{ maxWidth: largura }}
      role="img"
      aria-label={titulo}
    >
      {itens.map((item, i) => {
        const y = i * linha;
        const w = (item.valor / max) * larguraBarras;
        const yBarra = y + (linha - espessura) / 2;
        const texto = item.texto ?? numero.format(item.valor);
        return (
          <g key={`${item.rotulo}-${i}`} className="group">
            <title>{item.dica ?? `${item.rotulo}: ${texto}`}</title>
            {/* Alvo de hover maior que a barra: a linha inteira. */}
            <rect x={0} y={y} width={largura} height={linha} className="fill-transparent group-hover:fill-muted" />
            <text
              x={areaRotulo - 8}
              y={y + linha / 2}
              dominantBaseline="central"
              textAnchor="end"
              className="fill-foreground text-[12px]"
            >
              {cortar(item.rotulo, 22)}
            </text>
            <line
              x1={areaRotulo}
              x2={areaRotulo}
              y1={y}
              y2={y + linha}
              className="stroke-border"
              strokeWidth={1}
            />
            <path d={barraHorizontal(areaRotulo, yBarra, w, espessura)} fill="var(--grafico-serie)" />
            <text
              x={areaRotulo + w + 6}
              y={y + linha / 2}
              dominantBaseline="central"
              className="fill-muted-foreground text-[12px] tabular-nums"
            >
              {texto}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Máximo "redondo" do eixo (1, 2 ou 5 vezes uma potência de 10) e o passo das linhas de grade. */
export function eixoRedondo(maximo: number, marcas = 4): { max: number; passo: number } {
  if (maximo <= 0) return { max: 1, passo: 1 };
  const bruto = maximo / marcas;
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 5, 10].map((m) => m * potencia).find((p) => p >= bruto) ?? 10 * potencia;
  const passoInteiro = Math.max(1, Math.round(passo));
  return { max: Math.ceil(maximo / passoInteiro) * passoInteiro, passo: passoInteiro };
}

export type ItemColuna = { rotulo: string; rotuloCurto: string; valor: number };

/** Colunas verticais (série no tempo, ex.: leads por dia) com eixo Y e grade discreta. */
export function Colunas({ itens, titulo }: { itens: ItemColuna[]; titulo: string }) {
  if (itens.length === 0) return null;
  // Largura pensada para um card inteiro (~920px), sem crescer além dela.
  const largura = 920;
  const altura = 220;
  const esquerda = 36;
  const direita = 8;
  const topo = 8;
  const rodape = 24;
  const base = altura - rodape;
  const alturaPlot = base - topo;
  const larguraPlot = largura - esquerda - direita;
  const { max, passo } = eixoRedondo(Math.max(...itens.map((i) => i.valor)));
  const faixa = larguraPlot / itens.length;
  const espessura = Math.max(1, Math.min(24, faixa - 2));
  const cadaRotulo = Math.max(1, Math.ceil(itens.length / 12));
  const marcas: number[] = [];
  for (let v = 0; v <= max; v += passo) marcas.push(v);

  return (
    <svg
      viewBox={`0 0 ${largura} ${altura}`}
      className="h-auto w-full"
      style={{ maxWidth: largura }}
      role="img"
      aria-label={titulo}
    >
      {marcas.map((v) => {
        const y = base - (v / max) * alturaPlot;
        return (
          <g key={v}>
            <line x1={esquerda} x2={largura - direita} y1={y} y2={y} className="stroke-border" strokeWidth={1} />
            <text
              x={esquerda - 6}
              y={y}
              dominantBaseline="central"
              textAnchor="end"
              className="fill-muted-foreground text-[11px] tabular-nums"
            >
              {numero.format(v)}
            </text>
          </g>
        );
      })}
      {itens.map((item, i) => {
        const x = esquerda + i * faixa;
        const h = (item.valor / max) * alturaPlot;
        return (
          <g key={`${item.rotulo}-${i}`} className="group">
            <title>{`${item.rotulo}: ${numero.format(item.valor)}`}</title>
            <rect x={x} y={topo} width={faixa} height={alturaPlot} className="fill-transparent group-hover:fill-muted" />
            <path d={coluna(x + (faixa - espessura) / 2, base, espessura, h)} fill="var(--grafico-serie)" />
            {i % cadaRotulo === 0 ? (
              <text
                x={x + faixa / 2}
                y={base + 14}
                textAnchor="middle"
                className="fill-muted-foreground text-[11px] tabular-nums"
              >
                {item.rotuloCurto}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
