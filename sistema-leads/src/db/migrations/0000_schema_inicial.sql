CREATE TYPE "public"."canal_evento" AS ENUM('whatsapp', 'meta_form', 'lp_form', 'hotmart', 'presencial', 'manual');--> statement-breakpoint
CREATE TYPE "public"."canal_venda" AS ENUM('online', 'presencial');--> statement-breakpoint
CREATE TYPE "public"."direcao_mensagem" AS ENUM('in', 'out');--> statement-breakpoint
CREATE TYPE "public"."fonte_entrada" AS ENUM('whatsapp', 'meta_lead', 'framer', 'hotmart', 'manual', 'outra');--> statement-breakpoint
CREATE TYPE "public"."fonte_venda" AS ENUM('vendedor', 'hotmart', 'outra_plataforma');--> statement-breakpoint
CREATE TYPE "public"."papel_numero" AS ENUM('central', 'sdr', 'vendedor');--> statement-breakpoint
CREATE TYPE "public"."papel_usuario" AS ENUM('gestao', 'comercial');--> statement-breakpoint
CREATE TYPE "public"."status_conciliacao" AS ENUM('pendente', 'conciliada', 'divergente');--> statement-breakpoint
CREATE TYPE "public"."status_entrada" AS ENUM('pendente', 'processado', 'erro', 'ignorado');--> statement-breakpoint
CREATE TYPE "public"."status_revisao" AS ENUM('aberta', 'resolvida', 'descartada');--> statement-breakpoint
CREATE TYPE "public"."tipo_estagio" AS ENUM('aberto', 'ganho', 'perdido');--> statement-breakpoint
CREATE TYPE "public"."tipo_evento" AS ENUM('form_enviado', 'conversa_iniciada', 'estagio_alterado', 'responsavel_alterado', 'reuniao_agendada', 'ingresso_comprado', 'checkin_evento', 'venda_registrada', 'identidade_mesclada', 'nota');--> statement-breakpoint
CREATE TYPE "public"."tipo_identificador" AS ENUM('telefone', 'email', 'wa_id', 'meta_lead_id');--> statement-breakpoint
CREATE TYPE "public"."tipo_midia" AS ENUM('texto', 'audio', 'imagem', 'video', 'documento', 'figurinha', 'localizacao', 'contato', 'outro');--> statement-breakpoint
CREATE TYPE "public"."tipo_origem" AS ENUM('anuncio_ctwa', 'link_whatsapp', 'qr_code', 'form_meta', 'lp', 'organico', 'indicacao', 'desconhecida');--> statement-breakpoint
CREATE TYPE "public"."tipo_revisao" AS ENUM('conflito_identidade', 'outro');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"papel" "papel_usuario" DEFAULT 'comercial' NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "entradas_brutas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"fonte" "fonte_entrada" NOT NULL,
	"chave_idempotencia" text NOT NULL,
	"payload" jsonb NOT NULL,
	"recebido_em" timestamp with time zone DEFAULT now() NOT NULL,
	"status" "status_entrada" DEFAULT 'pendente' NOT NULL,
	"tentativas" integer DEFAULT 0 NOT NULL,
	"erro" text,
	"processado_em" timestamp with time zone,
	CONSTRAINT "entradas_brutas_fonte_chave_idempotencia_unique" UNIQUE("fonte","chave_idempotencia")
);
--> statement-breakpoint
CREATE TABLE "pessoas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome_exibicao" text,
	"estagio_id" uuid,
	"responsavel_id" text,
	"origem_primeiro_toque_id" uuid,
	"primeiro_contato_em" timestamp with time zone,
	"ultimo_contato_em" timestamp with time zone,
	"motivo_perda" text,
	"opt_out" boolean DEFAULT false NOT NULL,
	"mesclada_para_id" uuid,
	"mesclada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "identificadores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"tipo" "tipo_identificador" NOT NULL,
	"valor" text NOT NULL,
	"valor_original" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "identificadores_tipo_valor_unique" UNIQUE("tipo","valor")
);
--> statement-breakpoint
CREATE TABLE "eventos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"tipo" "tipo_evento" NOT NULL,
	"ocorrido_em" timestamp with time zone NOT NULL,
	"registrado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"canal" "canal_evento",
	"origem_id" uuid,
	"numero_monitorado" text,
	"usuario_id" text,
	"entrada_bruta_id" uuid,
	"dados" jsonb
);
--> statement-breakpoint
CREATE TABLE "mensagens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"numero_monitorado" text NOT NULL,
	"wa_msg_id" text NOT NULL,
	"chat_id" text NOT NULL,
	"direcao" "direcao_mensagem" NOT NULL,
	"tipo_midia" "tipo_midia" NOT NULL,
	"enviada_em" timestamp with time zone NOT NULL,
	"texto_abertura" varchar(300),
	"ctwa" jsonb,
	"dispositivo_id" uuid,
	"entrada_bruta_id" uuid,
	CONSTRAINT "mensagens_numero_monitorado_wa_msg_id_unique" UNIQUE("numero_monitorado","wa_msg_id")
);
--> statement-breakpoint
CREATE TABLE "origens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"tipo" "tipo_origem" NOT NULL,
	"padrao_texto" text,
	"meta_campaign_id" text,
	"meta_adset_id" text,
	"meta_ad_id" text,
	"meta_form_id" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"cidade" text,
	"evento" text,
	"produto" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criada_automaticamente" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "origens_codigo_unique" UNIQUE("codigo")
);
--> statement-breakpoint
CREATE TABLE "estagios" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"ordem" integer NOT NULL,
	"tipo" "tipo_estagio" NOT NULL,
	"gatilho_automatico" "tipo_evento",
	CONSTRAINT "estagios_nome_unique" UNIQUE("nome")
);
--> statement-breakpoint
CREATE TABLE "numeros" (
	"numero" text PRIMARY KEY NOT NULL,
	"apelido" text,
	"papel" "papel_numero",
	"usuario_id" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dispositivos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"usuario_id" text,
	"token_hash" text NOT NULL,
	"numero_detectado" text,
	"ultimo_sinal_em" timestamp with time zone,
	"ultimo_sync_em" timestamp with time zone,
	"fila_pendente" integer DEFAULT 0 NOT NULL,
	"versao_extensao" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dispositivos_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "fila_revisao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tipo" "tipo_revisao" NOT NULL,
	"pessoa_a_id" uuid,
	"pessoa_b_id" uuid,
	"motivo" text,
	"entrada_bruta_id" uuid,
	"status" "status_revisao" DEFAULT 'aberta' NOT NULL,
	"resolvido_por" text,
	"resolvido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vendas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pessoa_id" uuid NOT NULL,
	"produto" text NOT NULL,
	"valor_centavos" integer NOT NULL,
	"canal" "canal_venda" NOT NULL,
	"evento" text,
	"fonte" "fonte_venda" NOT NULL,
	"referencia_externa" text,
	"registrada_por" text,
	"ocorrida_em" timestamp with time zone NOT NULL,
	"conciliacao_status" "status_conciliacao" DEFAULT 'pendente' NOT NULL,
	"venda_par_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_estagio_id_estagios_id_fk" FOREIGN KEY ("estagio_id") REFERENCES "public"."estagios"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_responsavel_id_user_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_origem_primeiro_toque_id_origens_id_fk" FOREIGN KEY ("origem_primeiro_toque_id") REFERENCES "public"."origens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pessoas" ADD CONSTRAINT "pessoas_mesclada_para_id_pessoas_id_fk" FOREIGN KEY ("mesclada_para_id") REFERENCES "public"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "identificadores" ADD CONSTRAINT "identificadores_pessoa_id_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_pessoa_id_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_origem_id_origens_id_fk" FOREIGN KEY ("origem_id") REFERENCES "public"."origens"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_numero_monitorado_numeros_numero_fk" FOREIGN KEY ("numero_monitorado") REFERENCES "public"."numeros"("numero") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_usuario_id_user_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "eventos" ADD CONSTRAINT "eventos_entrada_bruta_id_entradas_brutas_id_fk" FOREIGN KEY ("entrada_bruta_id") REFERENCES "public"."entradas_brutas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_pessoa_id_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_numero_monitorado_numeros_numero_fk" FOREIGN KEY ("numero_monitorado") REFERENCES "public"."numeros"("numero") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_dispositivo_id_dispositivos_id_fk" FOREIGN KEY ("dispositivo_id") REFERENCES "public"."dispositivos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mensagens" ADD CONSTRAINT "mensagens_entrada_bruta_id_entradas_brutas_id_fk" FOREIGN KEY ("entrada_bruta_id") REFERENCES "public"."entradas_brutas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "numeros" ADD CONSTRAINT "numeros_usuario_id_user_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dispositivos" ADD CONSTRAINT "dispositivos_usuario_id_user_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fila_revisao" ADD CONSTRAINT "fila_revisao_pessoa_a_id_pessoas_id_fk" FOREIGN KEY ("pessoa_a_id") REFERENCES "public"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fila_revisao" ADD CONSTRAINT "fila_revisao_pessoa_b_id_pessoas_id_fk" FOREIGN KEY ("pessoa_b_id") REFERENCES "public"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fila_revisao" ADD CONSTRAINT "fila_revisao_entrada_bruta_id_entradas_brutas_id_fk" FOREIGN KEY ("entrada_bruta_id") REFERENCES "public"."entradas_brutas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fila_revisao" ADD CONSTRAINT "fila_revisao_resolvido_por_user_id_fk" FOREIGN KEY ("resolvido_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_pessoa_id_pessoas_id_fk" FOREIGN KEY ("pessoa_id") REFERENCES "public"."pessoas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_registrada_por_user_id_fk" FOREIGN KEY ("registrada_por") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "vendas" ADD CONSTRAINT "vendas_venda_par_id_vendas_id_fk" FOREIGN KEY ("venda_par_id") REFERENCES "public"."vendas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "entradas_brutas_status_idx" ON "entradas_brutas" USING btree ("status");--> statement-breakpoint
CREATE INDEX "identificadores_pessoa_id_idx" ON "identificadores" USING btree ("pessoa_id");--> statement-breakpoint
CREATE INDEX "eventos_pessoa_id_ocorrido_em_idx" ON "eventos" USING btree ("pessoa_id","ocorrido_em");--> statement-breakpoint
CREATE INDEX "mensagens_pessoa_id_enviada_em_idx" ON "mensagens" USING btree ("pessoa_id","enviada_em");