import { registrarProcessador } from "../registro";
import { processarManual } from "./manual";
import { processarWhatsapp } from "./whatsapp";

// Registro de todos os processadores de entrada, por fonte.
// Etapas 5 e 6 adicionam aqui: framer e meta_lead.
registrarProcessador("manual", processarManual);
registrarProcessador("whatsapp", processarWhatsapp);
