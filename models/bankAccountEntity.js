const CountryEntity = require("./countryEntity");

/**
 * bankAccountEntity — Métodos de pago disponibles en el sistema
 *
 * typeAccount define el tipo y determina qué campos son relevantes:
 *
 * Tradicionales:
 *   "bank_transfer"   → transferencia bancaria (number = IBAN/cuenta)
 *   "card"            → tarjeta (number = número de tarjeta)
 *   "cash"            → efectivo
 *   "sbp"             → Sistema de Pago Rápido Russia (number = teléfono)
 *   "tbank"           → T-Bank (number = teléfono)
 *   "yoomoney"        → YooMoney (number = wallet ID ej: 41001...)
 *
 * Cripto:
 *   "crypto_usdt_trc20"  → USDT en red TRC-20 (Tron)
 *   "crypto_usdt_erc20"  → USDT en red ERC-20 (Ethereum)
 *   "crypto_usdt_bep20"  → USDT en red BEP-20 (BSC)
 *   "crypto_btc"         → Bitcoin
 *   "crypto_eth"         → Ethereum
 *   "crypto_ton"         → TON (popular en Russia/Telegram)
 *   "crypto_usdc"        → USDC
 *   "binance_pay"        → Binance Pay (number = Binance Pay ID)
 *   "bybit_pay"          → Bybit Pay (number = Bybit UID/Pay ID)
 *
 * Campos cripto extras (no están en los tipos tradicionales):
 *   network       → red blockchain ("TRC-20", "ERC-20", "BEP-20", "mainnet", ...)
 *   currency      → moneda ("USDT", "BTC", "ETH", "TON", "USDC")
 *   qr_code       → URL o base64 del QR de la wallet (para mostrar en el frontend)
 *   min_amount    → monto mínimo de pago
 *   confirmations → confirmaciones requeridas antes de confirmar
 */
class bankAccountEntity {
  id           = "";
  name         = "";          // nombre visible: "USDT TRC-20", "Binance Pay", "T-Bank"
  number       = "";          // wallet address, teléfono, IBAN, Binance Pay ID, etc.
  cardAccount  = "";          // cuenta contable interna (legacy, puede ser alias)
  typeAccount  = "";          // ver lista arriba
  country      = new CountryEntity();
  active       = false;
  visible      = false;
  note         = "";

  // ── Campos específicos de cripto ──────────────────────────────────────────
  network       = "";         // "TRC-20" | "ERC-20" | "BEP-20" | "mainnet" | "TON"
  currency      = "";         // "USDT" | "BTC" | "ETH" | "TON" | "USDC" | "BNB"
  qr_code       = "";         // URL del QR o base64
  min_amount    = 0;          // mínimo en USD
  confirmations = 1;          // confirmaciones requeridas

  createdAt    = new Date();
  updatedAt    = new Date();

  constructor() {}

  set({
    id, name, number, cardAccount, typeAccount, country,
    active, visible, note,
    network, currency, qr_code, min_amount, confirmations,
    createdAt, updatedAt,
  }) {
    this.id           = id           ?? this.id;
    this.name         = name         ?? this.name;
    this.number       = number       ?? this.number;
    this.cardAccount  = cardAccount  ?? this.cardAccount;
    this.typeAccount  = typeAccount  ?? this.typeAccount;
    this.country      = country      ?? this.country;
    this.active       = active       ?? this.active;
    this.visible      = visible      ?? this.visible;
    this.note         = note         ?? this.note;
    this.network      = network      ?? this.network;
    this.currency     = currency     ?? this.currency;
    this.qr_code      = qr_code      ?? this.qr_code;
    this.min_amount   = min_amount   ?? this.min_amount;
    this.confirmations = confirmations ?? this.confirmations;
    this.createdAt    = createdAt    ?? this.createdAt;
    this.updatedAt    = updatedAt    ?? this.updatedAt;
  }

  get() {
    if (!this.name)        throw new Error("name es requerido");
    if (!this.number)      throw new Error("number es requerido");
    if (!this.typeAccount) throw new Error("typeAccount es requerido");
    if (!this.country)     throw new Error("country es requerido");
    return this;
  }

  // Helper: ¿es método cripto?
  isCrypto() {
    return this.typeAccount.startsWith("crypto_") ||
           ["binance_pay", "bybit_pay"].includes(this.typeAccount);
  }
}

module.exports = bankAccountEntity;
