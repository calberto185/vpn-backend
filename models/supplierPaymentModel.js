/**
 * SupplierPaymentModel — Pago realizado a un proveedor (gasto).
 * state: "pending" | "paid" | "overdue" | "cancelled"
 * method: "bank_transfer" | "crypto" | "card" | "cash" | "other"
 */
class SupplierPaymentModel {
  id              = '';
  supplierId      = null;         // FK → suppliers (nullable for free-text beneficiaries)
  supplierName    = '';           // Denormalized / beneficiary name
  recipientId     = null;         // FK → admin/clients (nullable)
  concept         = '';           // Concepto del pago
  category        = 'other';      // infrastructure|hosting|bandwidth|software|marketing|telecom|other
  serviceId       = null;         // FK → services (nullable)
  serviceName     = '';
  amount          = 0;
  currency        = 'USD';        // USD | EUR | PEN | RUB | ...
  method          = 'bank_transfer';
  reference       = '';           // Número de transacción / referencia
  period          = '';           // "2025-01" — período de facturación
  dueDate         = null;         // Fecha de vencimiento
  paidAt          = null;         // Fecha de pago efectivo
  state           = 'pending';
  picture         = '';           // Comprobante (imagen/PDF)
  notes           = '';
  signature       = '';           // HMAC-SHA256 firma digital
  signedAt        = null;         // ISO timestamp de firma
  createdAt       = new Date();
  updatedAt       = new Date();

  set({ id, supplierId, supplierName, concept, serviceId, serviceName,
        amount, currency, method, reference, period, dueDate, paidAt,
        state, picture, notes, createdAt, updatedAt }) {
    this.id          = id          ?? this.id;
    this.supplierId  = supplierId  ?? this.supplierId;
    this.supplierName = supplierName ?? this.supplierName;
    this.concept     = concept     ?? this.concept;
    this.serviceId   = serviceId   !== undefined ? serviceId : this.serviceId;
    this.serviceName = serviceName ?? this.serviceName;
    this.amount      = amount      ?? this.amount;
    this.currency    = currency    ?? this.currency;
    this.method      = method      ?? this.method;
    this.reference   = reference   ?? this.reference;
    this.period      = period      ?? this.period;
    this.dueDate     = dueDate     ? new Date(dueDate) : this.dueDate;
    this.paidAt      = paidAt      ? new Date(paidAt)  : this.paidAt;
    this.state       = state       ?? this.state;
    this.picture     = picture     ?? this.picture;
    this.notes       = notes       ?? this.notes;
    this.createdAt   = createdAt   ? new Date(createdAt) : this.createdAt;
    this.updatedAt   = updatedAt   ? new Date(updatedAt) : this.updatedAt;
  }
}

module.exports = SupplierPaymentModel;
