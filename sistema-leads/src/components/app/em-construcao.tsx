import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/** Placeholder das telas que ainda não foram implementadas. */
export function EmConstrucao({ titulo, etapa }: { titulo: string; etapa: number }) {
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
      <Card>
        <CardHeader>
          <CardTitle>Em construção</CardTitle>
          <CardDescription>{`Esta tela chega na Etapa ${etapa}.`}</CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
