import { z } from "zod";

// Mensagens de erro do zod em português do Brasil (vale para o processo todo).
// Importar este módulo antes de validar qualquer entrada que volte para o usuário ou para o piolho.
z.config(z.locales.ptBR());
