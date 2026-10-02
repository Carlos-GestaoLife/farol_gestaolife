import { registrarProcessador } from "../registro";
import { processarManual } from "./manual";

// Registro de todos os processadores de entrada, por fonte.
// Etapas 4 a 6 adicionam aqui: whatsapp, framer e meta_lead.
registrarProcessador("manual", processarManual);
