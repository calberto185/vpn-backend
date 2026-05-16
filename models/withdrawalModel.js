/**
 * withdrawalModel.js — Modelo para retiros de dinero
 * Tipos: pago a empleado, devolución a cliente, préstamo, gasto operativo, impuesto, otro
 */
class WithdrawalModel {
  id           = '';
  type         = 'other';         // WITHDRAWAL_TYPES
  recipient    = '';              // Nombre del beneficiario (empleado, cliente, etc.)
  recipientId  = null;            // FK opcional (ej. user_id para clientes)
  concept      = '';              // Descripción / motivo
  amount       = 0;
  currency     = 'USD';
  method       = 'cash';          // bank_transfer | crypto | card | cash | other
  reference    = '';              // Nro de transacción / comprobante
  period       = '';              // "2025-06" para agrupación mensual
  executedAt   = null;            // Fecha real de ejecución (null = aún no ejecutado)
  state        = 'pending';       // pending | completed | cancelled
  attachmentUrl = '';             // Comprobante / evidencia (URL)
  notes        = '';
  createdBy    = '';              // admin id
  createdAt    = new Date();
  updatedAt    = new Date();
}

module.exports = WithdrawalModel;
