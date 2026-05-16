/**
 * swagger.js — Configuración central de Swagger / OpenAPI 3.0
 *
 * Acceso: GET /api/docs
 * JSON spec: GET /api/docs.json
 */
const swaggerJsdoc = require("swagger-jsdoc");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title:       "SVION VPN — API Backend",
      version:     "2.0.0",
      description: `API REST central del sistema SVION VPN.
\n\n**Autenticación:** JWT Bearer token en el header \`Authorization: Bearer <token>\`
\n\n**Bot Telegram:** Header \`X-Bot-Key: <clave>\` para endpoints \`/api/bot/*\`
\n\n**Entornos:**
- Producción: \`https://carlosvm.ru:3000\`
- Desarrollo: \`http://localhost:3000\``,
      contact: {
        name:  "Carlos VM",
        email: "carlosvm1829@gmail.com",
      },
    },
    servers: [
      { url: "http://localhost:3000", description: "Desarrollo local" },
      { url: "https://carlosvm.ru:3000", description: "Producción" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type:         "http",
          scheme:       "bearer",
          bearerFormat: "JWT",
          description:  "Token JWT obtenido de POST /api/auth/login",
        },
        botApiKey: {
          type: "apiKey",
          in:   "header",
          name: "X-Bot-Key",
          description: "Clave secreta del bot Telegram (BOT_API_KEY en .env)",
        },
      },
      schemas: {
        // ── Respuesta base ────────────────────────────────────────────────
        ApiResponse: {
          type: "object",
          properties: {
            code:    { type: "string", example: "consultado" },
            message: { type: "string", example: "✅ Operación exitosa" },
            data:    { },
          },
        },
        ErrorResponse: {
          type: "object",
          properties: {
            code:    { type: "string", example: "error" },
            message: { type: "string", example: "Descripción del error" },
            status:  { type: "integer", example: 400 },
          },
        },
        // ── Auth ──────────────────────────────────────────────────────────
        LoginBody: {
          type: "object",
          required: ["email", "password"],
          properties: {
            email:    { type: "string", format: "email", example: "admin@svion.ru" },
            password: { type: "string", example: "MiPassword123" },
          },
        },
        LoginResponse: {
          type: "object",
          properties: {
            access_token:  { type: "string" },
            refresh_token: { type: "string" },
            user: {
              type: "object",
              properties: {
                id:         { type: "string" },
                email:      { type: "string" },
                firstNames: { type: "string" },
                role:       { type: "string", enum: ["admin", "client"] },
                isAdmin:    { type: "boolean" },
              },
            },
          },
        },
        SignupBody: {
          type: "object",
          required: ["firstNames", "lastNames", "email", "password"],
          properties: {
            firstNames: { type: "string", example: "Carlos" },
            lastNames:  { type: "string", example: "Vásquez" },
            email:      { type: "string", format: "email" },
            password:   { type: "string", minLength: 8 },
            phone:      { type: "string", example: "+7911234567" },
            countryCode:{ type: "string", example: "RU" },
          },
        },
        // ── Cliente ───────────────────────────────────────────────────────
        ClientProfile: {
          type: "object",
          properties: {
            id:             { type: "string" },
            firstNames:     { type: "string" },
            lastNames:      { type: "string" },
            email:          { type: "string" },
            picture:        { type: "string" },
            state:          { type: "string", enum: ["Pendiente","Activo","Suspendido","Bloqueado"] },
            verified:       { type: "boolean" },
            services:       { type: "array", items: { $ref: "#/components/schemas/ServiceSnapshot" } },
            tags:           { type: "array", items: { type: "string" } },
            pipeline_stage: { type: "string", enum: ["lead","contactado","activo","riesgo","inactivo"] },
            notes:          { type: "array", items: { $ref: "#/components/schemas/CRMNote" } },
            createdAt:      { type: "string", format: "date-time" },
          },
        },
        ServiceSnapshot: {
          type: "object",
          properties: {
            service_id:  { type: "string" },
            plan_id:     { type: "string" },
            plan_title:  { type: "string" },
            state:       { type: "string", enum: ["activo","suspendido"] },
            startedAt:   { type: "string", format: "date-time" },
            endedAt:     { type: "string", format: "date-time" },
            device_id:   { type: "string" },
          },
        },
        // ── Dispositivo ───────────────────────────────────────────────────
        Device: {
          type: "object",
          properties: {
            id:          { type: "string" },
            user_id:     { type: "string" },
            server_id:   { type: "string" },
            plan_id:     { type: "string" },
            protocol:    { type: "string", enum: ["s-ui","openvpn"] },
            active:      { type: "boolean" },
            suspend:     { type: "boolean" },
            revoked:     { type: "boolean" },
            sui_email:   { type: "string" },
            sui_sub_id:  { type: "string" },
            sub_url:     { type: "string", description: "URL de suscripción para apps VPN" },
            createdAt:   { type: "string", format: "date-time" },
          },
        },
        // ── Pagos ─────────────────────────────────────────────────────────
        Payment: {
          type: "object",
          properties: {
            id:         { type: "string" },
            user_id:    { type: "string" },
            amount:     { type: "number" },
            method:     { type: "string", enum: ["banco","crypto","efectivo"] },
            state:      { type: "string", enum: ["Pendiente","Varificando","Aceptado","Devuelto"] },
            plan:       { type: "object" },
            createdAt:  { type: "string", format: "date-time" },
            confirmedAt:{ type: "string", format: "date-time" },
          },
        },
        // ── Servidor ──────────────────────────────────────────────────────
        Server: {
          type: "object",
          properties: {
            id:          { type: "string" },
            name:        { type: "string" },
            host:        { type: "string" },
            protocol:    { type: "string", enum: ["s-ui","openvpn","both"] },
            active:      { type: "boolean" },
            country:     { type: "object" },
            sui_url:     { type: "string" },
            sui_sub_url: { type: "string" },
            createdAt:   { type: "string", format: "date-time" },
          },
        },
        // ── CRM ───────────────────────────────────────────────────────────
        CRMNote: {
          type: "object",
          properties: {
            id:            { type: "string" },
            text:          { type: "string" },
            createdAt:     { type: "string", format: "date-time" },
            createdByName: { type: "string" },
          },
        },
        PipelineStage: {
          type: "string",
          enum: ["lead","contactado","activo","riesgo","inactivo"],
        },
        // ── Bot ───────────────────────────────────────────────────────────
        BotActivateBody: {
          type: "object",
          required: ["telegram_id","plan_id","server_id"],
          properties: {
            telegram_id: { type: "integer", example: 123456789 },
            plan_id:     { type: "string" },
            server_id:   { type: "string" },
            gb_limite:   { type: "integer", example: 50 },
            dias:        { type: "integer", example: 30 },
            payment_id:  { type: "string" },
          },
        },
        // ── Public: Planes ────────────────────────────────────────────────
        PublicPlan: {
          type: "object",
          properties: {
            id:             { type: "string", example: "uuid-plan-123" },
            title_prefix:   { type: "string", example: "Plan" },
            title_name:     { type: "string", example: "Basic" },
            title_suffix:   { type: "string", example: "VPN" },
            price:          { type: "number", example: 9.99 },
            description:    { type: "string", example: "Acceso VPN básico" },
            features:       { type: "array", items: { type: "string" }, example: ["1 dispositivo", "10 GB"] },
            button_name:    { type: "string", example: "Comprar ahora" },
            kind:           { type: "string", example: "monthly" },
            global:         { type: "boolean", example: true },
            main:           { type: "boolean", example: false },
            language:       { type: "string", example: "es" },
            active:         { type: "boolean", example: true },
            visible:        { type: "boolean", example: true },
            currencyName:   { type: "string", example: "Dólar" },
            currencyCode:   { type: "string", example: "USD" },
            currencySymbol: { type: "string", example: "$" },
            currencyFormat: { type: "string", example: "$ {price}" },
            limitDevices:   { type: "integer", example: 1 },
            service: {
              type: "object",
              properties: {
                sortName:    { type: "string", example: "S-UI" },
                longName:    { type: "string", example: "Shadowsocks UI" },
                Description: { type: "string" },
                picture:     { type: "string", example: "https://..." },
                state:       { type: "string", example: "activo" },
              },
            },
          },
        },
        // ── Public: Países ────────────────────────────────────────────────
        Country: {
          type: "object",
          properties: {
            id:             { type: "string", example: "uuid-country-123" },
            countryName:    { type: "string", example: "Rusia" },
            countryCode:    { type: "string", example: "RU" },
            languageName:   { type: "string", example: "Ruso" },
            languageCode:   { type: "string", example: "ru" },
            currencyName:   { type: "string", example: "Rublo" },
            currencyCode:   { type: "string", example: "RUB" },
            currencySymbol: { type: "string", example: "₽" },
            currencyFormat: { type: "string", example: "₽{price}" },
            flag:           { type: "string", example: "🇷🇺" },
            phoneCode:      { type: "string", example: "+7" },
            isActive:       { type: "boolean", example: true },
            visible:        { type: "boolean", example: true },
            continent: {
              type: "object",
              properties: {
                id:   { type: "string" },
                name: { type: "string", example: "Europa" },
                code: { type: "string", example: "EU" },
              },
            },
            createdAt: { type: "string", format: "date-time" },
            updatedAt: { type: "string", format: "date-time" },
          },
        },
        CountryBody: {
          type: "object",
          required: ["countryName","countryCode","languageName","languageCode","currencyName","currencyCode","currencySymbol","currencyFormat","flag","phoneCode","continent"],
          properties: {
            countryName:    { type: "string", example: "Perú" },
            countryCode:    { type: "string", example: "PE" },
            languageName:   { type: "string", example: "Español" },
            languageCode:   { type: "string", example: "es" },
            currencyName:   { type: "string", example: "Sol" },
            currencyCode:   { type: "string", example: "PEN" },
            currencySymbol: { type: "string", example: "S/" },
            currencyFormat: { type: "string", example: "S/{price}" },
            flag:           { type: "string", example: "🇵🇪" },
            phoneCode:      { type: "string", example: "+51" },
            isActive:       { type: "boolean", example: true },
            visible:        { type: "boolean", example: true },
            continent:      { type: "object", description: "Objeto ContinentsEntity" },
          },
        },
        // ── Cripto ────────────────────────────────────────────────────────
        CryptoMethod: {
          type: "object",
          properties: {
            id:          { type: "string" },
            name:        { type: "string", example: "USDT TRC-20" },
            typeAccount: { type: "string", example: "crypto_usdt_trc20" },
            address:     { type: "string", example: "TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE" },
            network:     { type: "string", example: "TRC-20" },
            currency:    { type: "string", example: "USDT" },
            qr_code:     { type: "string" },
            min_amount:  { type: "number", example: 3 },
          },
        },
      },
    },
    // Seguridad global — la mayoría de endpoints requiere JWT
    security: [{ bearerAuth: [] }],
    tags: [
      { name: "Auth",     description: "Autenticación y sesiones" },
      { name: "Client",   description: "Portal del cliente (Angular)" },
      { name: "Admin",    description: "Panel de administración" },
      { name: "Bot",      description: "Endpoints para el bot Telegram Python" },
      { name: "Payments", description: "Gestión de pagos" },
      { name: "Crypto",   description: "Pagos con criptomonedas" },
      { name: "Webhooks", description: "Notificaciones de pasarelas externas" },
      { name: "S-UI",     description: "Gestión del panel S-UI multi-servidor" },
      { name: "CRM",      description: "CRM propio — notas, tags, pipeline" },
      { name: "Servers",  description: "Servidores VPN" },
      { name: "Devices",  description: "Dispositivos y certificados" },
      { name: "Plans",    description: "Planes de suscripción" },
      { name: "VPN",      description: "Certificados OpenVPN" },
      { name: "System",   description: "Sistema y configuración" },
      { name: "Public",   description: "Endpoints públicos sin auth" },
    ],
  },
  // Leer anotaciones JSDoc de todos los archivos de rutas
  apis: [
    "./routes/*.js",
    "./routes/sui/*.js",
  ],
};

const swaggerSpec = swaggerJsdoc(options);
module.exports = swaggerSpec;
