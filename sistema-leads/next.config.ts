import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // O indicador do Next (só em desenvolvimento) ficava no canto inferior esquerdo, em cima do
  // rodapé do menu lateral (nome do usuário e botão Sair).
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
