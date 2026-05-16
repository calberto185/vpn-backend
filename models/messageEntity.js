/**
 * messageEntity.js
 *
 * Representa un mensaje entre el administrador y un cliente (o grupo de clientes).
 *
 * Casos de uso:
 *   type = 'admin_to_client' → Admin envía a 1, varios o todos los clientes.
 *   type = 'client_to_admin' → Cliente envía consulta al administrador.
 *
 * Canales de entrega disponibles (array):
 *   'in_app'    — notificación dentro del panel web
 *   'email'     — correo electrónico
 *   'telegram'  — mensaje directo por Telegram Bot
 *   'whatsapp'  — mensaje por WhatsApp (Twilio)
 */
class MessageEntity {
  id          = "";         // UUID
  type        = "admin_to_client"; // "admin_to_client" | "client_to_admin"

  // ── Remitente ────────────────────────────────────────────────────────────────
  from_id     = "";         // user ID del remitente
  from_name   = "";         // nombre legible del remitente

  // ── Destinatarios ────────────────────────────────────────────────────────────
  /** Para admin_to_client: array de user IDs o el string literal "all"
   *  Para client_to_admin: vacío (va siempre al admin) */
  to          = [];         // string[] | "all"
  to_label    = "";         // etiqueta legible: "Todos", "VIP", "Juan García", …

  // ── Contenido ────────────────────────────────────────────────────────────────
  subject     = "";
  body        = "";

  // ── Canales seleccionados para envío ─────────────────────────────────────────
  channels    = ["in_app"]; // string[]

  // ── Estado de entrega por canal ──────────────────────────────────────────────
  delivery    = {
    email:     { sent: false, error: null },
    telegram:  { sent: false, error: null },
    whatsapp:  { sent: false, error: null },
  };

  // ── Lecturas ──────────────────────────────────────────────────────────────────
  read_by     = [];         // string[] — IDs de usuarios que leyeron

  // ── Metadatos ─────────────────────────────────────────────────────────────────
  createdAt   = new Date();
  updatedAt   = new Date();

  constructor() {}

  set({ id, type, from_id, from_name, to, to_label, subject, body,
        channels, delivery, read_by, createdAt, updatedAt }) {
    this.id         = id         ?? this.id;
    this.type       = type       ?? this.type;
    this.from_id    = from_id    ?? this.from_id;
    this.from_name  = from_name  ?? this.from_name;
    this.to         = to         ?? this.to;
    this.to_label   = to_label   ?? this.to_label;
    this.subject    = subject    ?? this.subject;
    this.body       = body       ?? this.body;
    this.channels   = channels   ?? this.channels;
    this.delivery   = delivery   ?? this.delivery;
    this.read_by    = read_by    ?? this.read_by;
    this.createdAt  = createdAt  ? new Date(createdAt) : this.createdAt;
    this.updatedAt  = updatedAt  ? new Date(updatedAt) : this.updatedAt;
  }
}

module.exports = MessageEntity;
