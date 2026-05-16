/**
 * suppliersController.js — CRUD de proveedores/empresas
 */
const { getDB, nameCollections } = require('../services/dbServices');
const SupplierModel = require('../models/supplierModel');
const { v4: uuidv4 } = require('uuid');

const col = () => getDB().collection(nameCollections.suppliers);

/** GET /api/suppliers — lista todos los proveedores */
async function list(req, res) {
  try {
    const { active, category, search } = req.query;
    const filter = {};
    if (active !== undefined) filter.active = active === 'true';
    if (category) filter.category = category;
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { legalName: { $regex: search, $options: 'i' } },
        { serviceName: { $regex: search, $options: 'i' } },
      ];
    }
    const suppliers = await col().find(filter).sort({ name: 1 }).toArray();
    res.json({ status: 200, data: suppliers });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error al obtener proveedores', error: err.message });
  }
}

/** GET /api/suppliers/:id */
async function getOne(req, res) {
  try {
    const supplier = await col().findOne({ id: req.params.id });
    if (!supplier) return res.status(404).json({ status: 404, message: 'Proveedor no encontrado' });
    res.json({ status: 200, data: supplier });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error al obtener proveedor', error: err.message });
  }
}

/** POST /api/suppliers */
async function create(req, res) {
  try {
    const { name, legalName, taxId, email, phone, country, address, category,
            serviceId, serviceName, serviceDescription, contactName, website, notes } = req.body;

    if (!name) return res.status(400).json({ status: 400, message: 'El nombre es requerido' });

    const supplier = new SupplierModel();
    supplier.id                 = uuidv4();
    supplier.name               = name.trim();
    supplier.legalName          = (legalName || '').trim();
    supplier.taxId              = (taxId || '').trim();
    supplier.email              = (email || '').trim();
    supplier.phone              = (phone || '').trim();
    supplier.country            = country || {};
    supplier.address            = (address || '').trim();
    supplier.category           = category || 'other';
    supplier.serviceId          = serviceId || null;
    supplier.serviceName        = (serviceName || '').trim();
    supplier.serviceDescription = (serviceDescription || '').trim();
    supplier.contactName        = (contactName || '').trim();
    supplier.website            = (website || '').trim();
    supplier.notes              = (notes || '').trim();
    supplier.active             = true;
    supplier.createdAt          = new Date();
    supplier.updatedAt          = new Date();

    await col().insertOne(supplier);
    res.status(201).json({ status: 201, data: supplier });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error al crear proveedor', error: err.message });
  }
}

/** PUT /api/suppliers/:id */
async function update(req, res) {
  try {
    const existing = await col().findOne({ id: req.params.id });
    if (!existing) return res.status(404).json({ status: 404, message: 'Proveedor no encontrado' });

    const allowed = ['name','legalName','taxId','email','phone','country','address','category',
                     'serviceId','serviceName','serviceDescription','contactName','website','notes','active'];
    const patch = { updatedAt: new Date() };
    for (const field of allowed) {
      if (req.body[field] !== undefined) patch[field] = req.body[field];
    }

    await col().updateOne({ id: req.params.id }, { $set: patch });

    // ── Sync de categoría: si cambia la categoría del proveedor, actualizar sus pagos ──
    let syncedPayments = 0;
    if (req.body.category && req.body.category !== existing.category) {
      const spCol = getDB().collection(nameCollections.supplierPayments);
      const result = await spCol.updateMany(
        { supplierId: req.params.id },
        { $set: { category: req.body.category, updatedAt: new Date() } }
      );
      syncedPayments = result.modifiedCount;
    }

    const updated = await col().findOne({ id: req.params.id });
    res.json({ status: 200, data: updated, syncedPayments });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error al actualizar proveedor', error: err.message });
  }
}

/** DELETE /api/suppliers/:id — soft delete (active = false) */
async function remove(req, res) {
  try {
    const existing = await col().findOne({ id: req.params.id });
    if (!existing) return res.status(404).json({ status: 404, message: 'Proveedor no encontrado' });
    await col().updateOne({ id: req.params.id }, { $set: { active: false, updatedAt: new Date() } });
    res.json({ status: 200, message: 'Proveedor desactivado' });
  } catch (err) {
    res.status(500).json({ status: 500, message: 'Error al eliminar proveedor', error: err.message });
  }
}

module.exports = { list, getOne, create, update, remove };
