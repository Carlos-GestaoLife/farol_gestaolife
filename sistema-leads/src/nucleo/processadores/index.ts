import { registrarProcessador } from "../registro";
import { processarFramer } from "./framer";
import { processarManual } from "./manual";
import { processarMetaLead } from "./meta-lead";
import { processarWhatsapp } from "./whatsapp";

// Registro de todos os processadores de entrada, por fonte.
registrarProcessador("manual", processarManual);
registrarProcessador("whatsapp", processarWhatsapp);
registrarProcessador("framer", processarFramer);
registrarProcessador("meta_lead", processarMetaLead);
