// Layout das telas públicas (login): conteúdo centralizado, sem menu.
export default function LayoutAuth({ children }: { children: React.ReactNode }) {
  return (
    <main className="bg-muted/40 flex flex-1 items-center justify-center p-4">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
