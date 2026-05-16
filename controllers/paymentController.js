const { getDB, nameCollections } = require("../services/dbServices");
const { v4: uuidv4 } = require("uuid");
const { decryptPassword, encryptPassword } = require("../utils/encrypt_decrypt");
const { generateAccessToken, generateRefreshToken, verifyRefreshToken } = require("../utils/jwtService");
const { getUploader, directoryFiles } = require("../services/storageService");
const SessionsEntity = require("../models/sessionsEntity");
const PaymentEntity = require("../models/paymentsEntity");
const BankAccountEntity = require("../models/bankAccountEntity");
const PlansEntity = require("../models/plansEntity");
const CountryEntity = require("../models/countryEntity");
const { sendMail }    = require("../shared/mailer");
const { logFromReq }  = require("../utils/binnacle");
const TermsEntity = require("../models/termsEntity");
const { generarRangoFechas, getNextDate } = require("../utils/period")
const PlanClientDto = require("../models/planClientDto");
const PlanClientServerDto = require("../models/planClientServerDto")
const ServersEntity = require("../models/serversEntity");
const AdminEntity = require("../models/adminEntity");
const AdminTelephoneDto = require("../models/adminTelephoneDto");
const days = require("dayjs")

async function getPaymentsToAdmin(req, res) {
  try {
    let aggregate = [
      {
        "$match": {
        }
      },
    ]
    const db = getDB();
    const dataToResponse = await db.collection(nameCollections.payments).aggregate(aggregate).toArray()
    // if(!dataToResponse) { return res.status(400).send({code: "No encontrado", status: 400, message: "No hay usuarios registrados"}); }
    res.status(200).send({code: "consultado", status: 200, message: "✅ Consulta realizada exitosamente!.", data: dataToResponse});
  } catch (error) {
    console.log("error: ", error)
    res.status(500).send({ceode: "error", status: 500, message: "Error al realisar la consulta de pagos"});
  }
}

async function getPaymentsFromClient(req, res) {
  try {
    // console.log("req.user: ", req.user)
    const { id, email } = req.user;
    let aggregate = [
      {
        "$match": {
          user_id: id,
          user_email: email
        }
      }, 
      // { $addFields: {
      //     password: ''
      // } },
      // {
      //   "$project": {
      //     "": -1
      //   }
      // }
      {
        "$sort": { "createdAt": -1 } 
      },
      {
        "$limit": 30
      }
    ]
    const db = getDB();
    const dataToResponse = await db.collection(nameCollections.payments).aggregate(aggregate).toArray();
    // if(!dataToResponse) { return res.status(400).send({code: "No encontrado", status: 400, message: "No hay usuarios registrados"}); }
    res.status(200).send({code: "consultado", status: 200, message: "✅ Consulta realizada exitosamente!.", data: dataToResponse});
  } catch (error) {
    console.log("error: ", error)
    res.status(500).send({ceode: "error", status: 500, message: "Error al realisar la consulta de pagos"});
  }
}

// hacer pago por usuario
async function hacerpago(req, res) {
  try {
    const datEntity = new PaymentEntity();
    datEntity.set(req.body);
    datEntity.id = uuidv4();
    const db = getDB();
    const dataToSave = datEntity.get();
    const resultaSave = await db.collection(nameCollections.payments).insertOne(dataToSave);
    res.status(200).send({code: "registrado", status: 200, message: "✅ Transaccion registrado exitosamente!."});
  } catch (err) {
    res.status(500).send({ceode: "error", status: 500, message: "Error al registrar la transaccion"});
  }
}
async function hacerpagoAdmin(req, res) {
  try {
    const db = getDB();
    // console.log("req.body.payment: ", req.body.payment)
/** PAYMENT fill */
    const paymentEntity = new PaymentEntity();
    paymentEntity.set(JSON.parse(req.body.payment))
    paymentEntity.id = uuidv4();
    paymentEntity.picture = req.file.filename;
    const dataToSave = paymentEntity.get();
    const resultaSave = await db.collection(nameCollections.payments).insertOne(dataToSave);

    res.status(200).send({code: "registrado", status: 200, message: "✅ Pago cargado exitosamente!."});
  } catch (err) {
    console.log("err: ", err)
    res.status(500).send({ceode: "error", status: 500, message: "Error al registrar la transaccion"});
  }
}
async function hacerpagoInicial(req, res) {
  try {
    const payments = req.body?.payment ? JSON.parse(req.body?.payment) : {};
    const _isGLobal = payments?.global
    if (!payments) {
      throw new Error("No se ha recibido información suficiente del pago a procesar.");
    }
    if (!payments?.plan) {
      throw new Error("No se ha recibido información del plan asociado al pago.");
    }
    if(_isGLobal) {
      if (!payments?.countries) {
        throw new Error("No se ha recibido información de los países vinculados al servicio.");
      }
    }
    if (!payments?.bank) {
      throw new Error("No se ha recibido información del método o entidad de pago.");
    }
    if (!payments?.terms) {
      throw new Error("No se ha confirmado la aceptación de los términos del servicio.");
    }
    if (!payments?.payTo || !Number(payments?.payTo)) {
      throw new Error("No se ha recibido información sobre el período o número de pago del servicio.");
    }
    if (!payments?.total || !Number(payments?.total)) {
      throw new Error("No se ha recibido información sobre el monto total del pago.");
    }
    if (!payments?.PersonalData) {
      throw new Error("No se ha recibido información completa de los datos personales del cliente.");
    }

    const { plan, countries, bank, terms, payTo, isGLobal, total, PersonalData } = payments;

 

    const db = getDB();
    // console.log("req.user: ", req.user)
    /** CONSULTA DATAS */
    const user = await db.collection(nameCollections.admin).findOne({id:  req.user.id});
    if(!user) { return res.status(404).send({code: "not-exist", status: 404, message: "Usuario ya existe"}); }
    const userEntity = new AdminEntity();
    userEntity.set(user);
    // let data_Terms = await db.collection(nameCollections.terms).findOne({active: true, "country.id": user.country.id});
    // if(!data_Terms) {
    //   data_Terms = await db.collection(nameCollections.terms).findOne({active: true});
    // }
    const [data_plan, data_terms, data_accountBank, data_servers, dataAllCountries] = await Promise.all([
      db.collection(nameCollections.plans).findOne({ id: plan }),
      // db.collection(nameCollections.countries).aggregate([
      //   { $match: { id: { $in: JSON.parse(countries) } } }
      // ]).toArray(),
      db.collection(nameCollections.terms).findOne({ id: terms }),
      db.collection(nameCollections.bankAccount).findOne({ id: bank }),
      db.collection(nameCollections.servers).find({}).toArray(),
      db.collection(nameCollections.countries).find({}).toArray(),
    ]);

    // Validar los resultados opcionalmente
    /** get PLAN */
    // console.log("data_plan: ", data_plan)
    if (!data_plan) throw new Error("Plan no encontrado");
    const selectedPlan = new PlansEntity();
    selectedPlan.set(data_plan);

    /** get COUNTRIES */
    // console.log("dataAllCountries: ", dataAllCountries)

    // console.log(" payments?.PersonalData: ",  payments?.PersonalData)
    if (!dataAllCountries.length) throw new Error("Los Paises no fueron encontrados");
    const selectedCountries = [].concat(dataAllCountries).map(p => {
      const _countryEntity = new CountryEntity();
      _countryEntity.set(p);
      return _countryEntity;
    })

    /** get TERMS */
    // console.log("data_terms: ", data_terms)
    if (!data_terms) throw new Error("Términos no encontrados");
    const selectedTerms = new TermsEntity()
    selectedTerms.set(data_terms);

    /** get BANK ACCOUNT */
    // console.log("data_accountBank: ", data_accountBank)
    if (!data_accountBank) throw new Error("Cuenta bancaria no encontrada");
    const selectedBank = new BankAccountEntity()
    selectedBank.set(data_accountBank)

    /** get SERVERS */
    // console.log("data_servers: ", data_servers)
    if (!data_servers.length) throw new Error("Los servidores no fueron encontrados");
    const selectedServers = [].concat(data_servers).map(p => {
      const _ServersEntity = new ServersEntity();
      _ServersEntity.set(p);
      return _ServersEntity;
    })

    /** COMPLETE PERSONAL DATA */
    /** Fill Coutry */
    if(!userEntity?.country?.countryName) {
      const exist_country_user = selectedCountries.find(f => f.id == payments?.PersonalData?.country);
      if(!exist_country_user) throw new Error("El País de origen no fue encontrado. Intentar mas tarde");
      userEntity.country = exist_country_user;
    }

    /** Fill Telephone */
    if(!userEntity?.telephone?.length) {
      const exist_country_user_telepone =  selectedCountries.find(f => f.id == payments?.PersonalData?.telephone?.country);
      if(!exist_country_user_telepone) throw new Error("No se encontro el código del pais seleccionado!.");
      const modelCountryToTelephone = new CountryEntity();
      modelCountryToTelephone.set(exist_country_user_telepone);
      const modelTelephone = new AdminTelephoneDto()
      modelTelephone.countryCode = modelCountryToTelephone.countryCode;
      modelTelephone.countryName = modelCountryToTelephone.countryName;
      modelTelephone.flag = modelCountryToTelephone.flag;
      modelTelephone.isActive = true;
      modelTelephone.kind = "-"
      modelTelephone.phone = payments?.PersonalData?.telephone?.number+"";
      modelTelephone.phoneCode = modelCountryToTelephone.phoneCode;
      modelTelephone.telegram_id = "-";
      modelTelephone.whatsapp_id = modelCountryToTelephone.phoneCode.replace("+", "") + "" + payments?.PersonalData?.telephone?.number + "@c.us";
      userEntity.telephone = [ modelTelephone ];
    }

    /** Fill PlanClient */
    const _planClientDto = new PlanClientDto()
    _planClientDto.active = selectedPlan.active; 
    _planClientDto.country = selectedPlan.country; 
    _planClientDto.currencyCode = selectedPlan.currencyCode; 
    _planClientDto.currencyFormat = selectedPlan.currencyFormat; 
    _planClientDto.currencyName = selectedPlan.currencyName; 
    _planClientDto.currencySymbol = selectedPlan.currencySymbol; 
    _planClientDto.endedAt = null; 
    _planClientDto.global = selectedPlan.global; 
    _planClientDto.kind = selectedPlan.kind; 
    _planClientDto.limitDevices = selectedPlan.limitDevices; 
    _planClientDto.plan_id = selectedPlan.id; 
    _planClientDto.plan_title_name = selectedPlan.title_name; 
    _planClientDto.plan_title_prefix = selectedPlan.title_prefix; 
    _planClientDto.plan_title_suffix = selectedPlan.title_suffix; 
    _planClientDto.price = selectedPlan.price; 
    _planClientDto.service_id = selectedPlan.service.id; 
    _planClientDto.service_longName = selectedPlan.service.longName; 
    _planClientDto.service_sortName = selectedPlan.service.sortName; 
    _planClientDto.startedAt = new Date(); 
    _planClientDto.visible = selectedPlan.visible; 

    
    const WhereCountrySelected = !selectedPlan.global ? selectedPlan.service.country.id : selectedPlan.country.id;
    // console.log("global: ", selectedPlan.global)
    // console.log("WhereCountrySelected: ", WhereCountrySelected)
    const ServersToAdd = selectedServers.reduce((acc = [], n) => {
      // console.log("n.country.id: ", n.country.id)
      if(n.country.id == WhereCountrySelected) {
        const planClientServerDto = new PlanClientServerDto();
        planClientServerDto.access_permmit = n.active ; 
        planClientServerDto.addAt = new Date(); 
        planClientServerDto.plan_id = selectedPlan.id; 
        planClientServerDto.server_country = n.country.countryName ; 
        planClientServerDto.server_id = n.id; 
        planClientServerDto.server_name = n.name; 
        planClientServerDto.visible = n.visible; 
        acc.push(planClientServerDto);
      }
      return acc;
    }, [])
    _planClientDto.servers = ServersToAdd; 

    if(!!userEntity.country.countryName && !!userEntity?.telephone?.length && !!_planClientDto.plan_id) {
     await db.collection(nameCollections.admin).updateOne({id:  userEntity.id}, {$set: { telephone: userEntity.telephone, country: userEntity.country, services: [_planClientDto]}}); 
    }

   
    // return res.status(200).send({code: "registrado", status: 200, message: "✅ Transaccion registrado exitosamente!."});
// plan, countries, bank, terms, payTo, isGLobal, total, PersonalData
/** PAYMENT fill */
    const paymentEntity = new PaymentEntity();
    paymentEntity.amount = Number(total);
    paymentEntity.createdAt = new Date();
    paymentEntity.id = uuidv4();
    paymentEntity.kind = "PAGO"; // PAGO, DEVOLUCION
    paymentEntity.method = selectedBank.typeAccount
    paymentEntity.methodPay.cardAccount = selectedBank.cardAccount;
    paymentEntity.methodPay.id = selectedBank.id;
    paymentEntity.methodPay.name = selectedBank.name;
    paymentEntity.methodPay.number = selectedBank.number;
    paymentEntity.methodPay.typeAccount = selectedBank.typeAccount;
    paymentEntity.note = "El cliente ha pagado por "+payTo+ " " + selectedPlan.kind+"(s)"
    paymentEntity.period = new Date()
    paymentEntity.picture = req.file.filename;
    paymentEntity.plan.active = selectedPlan.active;
    paymentEntity.plan.country = selectedPlan.country;
    paymentEntity.plan.currencyCode = selectedPlan.currencyCode;
    paymentEntity.plan.currencyFormat = selectedPlan.currencyFormat;
    paymentEntity.plan.currencyName = selectedPlan.currencyName;
    paymentEntity.plan.currencySymbol = selectedPlan.currencySymbol;
    paymentEntity.plan.global = selectedPlan.global;
    paymentEntity.plan.kind = selectedPlan.kind;
    paymentEntity.plan.limitDevices = selectedPlan.limitDevices;
    paymentEntity.plan.plan_id = selectedPlan.id;
    paymentEntity.plan.plan_title_name = selectedPlan.title_name;
    paymentEntity.plan.plan_title_prefix = selectedPlan.title_prefix;
    paymentEntity.plan.plan_title_suffix = selectedPlan.title_suffix;
    paymentEntity.plan.price = selectedPlan.price;
    paymentEntity.plan.servers = ServersToAdd;
    paymentEntity.plan.service_id = selectedPlan.service.id;
    paymentEntity.plan.service_longName = selectedPlan.service.longName;
    paymentEntity.plan.service_sortName = selectedPlan.service.sortName;
    paymentEntity.plan.visible = selectedPlan.visible;
    // paymentEntity.state = "revisión"
    // paymentEntity.states =
    paymentEntity.user_email = userEntity.email;
    paymentEntity.user_id = userEntity.id;
    paymentEntity.user_name = userEntity.firstNames + " " + userEntity.lastNames;
    paymentEntity.plan.startedAt = new Date();
    paymentEntity.plan.endedAt = null;


    const dataToSave = paymentEntity.get();
  
    let currentDate = new Date();
    const precioReal = Number(total) / payTo;
    const dataToSaveAll = Array.from({ length: payTo }, (_, pay) => {
      // console.log("pay: ",pay)
      const newVal = new PaymentEntity();
      newVal.set(structuredClone(dataToSave));
      // console.log("newVal: ", newVal)
      newVal.id = uuidv4();
      newVal.amount = precioReal;
      let startedAt = null;
      let endedAt = null;
      if(payTo > 1 && pay > 0) {
        startedAt = currentDate
        endedAt = getNextDate(startedAt, newVal.plan.kind);
        newVal.isPrePay = false;
      } else {
        startedAt = currentDate;
        endedAt = getNextDate(startedAt,newVal.plan.kind);
        newVal.isPrePay = true;
      }
        console.log("newVal.plan.startedAt: ", startedAt);
        console.log("newVal.plan.endedAt: ",endedAt)
        newVal.plan.startedAt = startedAt;
        newVal.plan.endedAt = endedAt;
        currentDate = endedAt;
      return newVal;
    })
    // const resultaSave = await db.collection(nameCollections.payments).insertOne(dataToSave);
    console.log("dataToSaveAll: ", dataToSaveAll)
    if(!!dataToSaveAll.length) {
      const resultaSave = await db.collection(nameCollections.payments).insertMany(dataToSaveAll);
    }

    res.status(200).send({code: "registrado", status: 200, message: "✅ Transaccion registrado exitosamente!."});
  } catch (err) {
    console.log("err: ", err)
    res.status(500).send({ceode: "error", status: 500, message: "Error al registrar la transaccion"});
  }
}
// editar pago por usuario
async function editarpago(req, res) {
  try {
    const exist = await db.collection(nameCollections.payments).findOne({ id: dataToSave.id, period: dataToSave.period});
    if(exist) { return res.status(400).send({code: "No encontrado", status: 400, message: "La transaccion fue eliminada o ya no existe"}); }
    const datEntity = new PaymentEntity();
      datEntity.set(exist);
    if(!checkRole("admin")) {
      let {
        id,
        user_id,
        adminAccount,
        adminCoin,
        createdAt,
         ...data} = req.body;
      datEntity.set(data);
    } else {
      datEntity.set(req.body);
    }
    const dataToSave = datEntity.get();
    const db = getDB();
    const resultaSave = await db.collection(nameCollections.payments).updateOne( { id: id }, { $set: dataToSave } );
    res.status(200).send({code: "actualizado", status: 200, message: "✅ Transaccion actualizada exitosamente!."});
  } catch (err) {
    res.status(500).send({ceode: "error", status: 500, message: "Error al actualizar transaccion"});
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/payments/confirm  — Admin confirma un pago y activa el servicio
// body: { payment_id }
// ═══════════════════════════════════════════════════════════════════════════════
async function confirmPayment(req, res) {
  try {
    const { payment_id } = req.body;
    if (!payment_id) return res.status(400).json({ code: "faltan_datos", message: "payment_id requerido" });
    const db   = getDB();
    const pago = await db.collection(nameCollections.payments).findOne({ id: payment_id });
    if (!pago) return res.status(404).json({ code: "no_encontrado", message: "Pago no encontrado" });
    if (pago.state === "Aceptado") return res.status(400).json({ code: "ya_confirmado" });

    const now = new Date();
    await db.collection(nameCollections.payments).updateOne(
      { id: payment_id },
      {
        $set: { state: "Aceptado", confirmedAt: now, confirmedBy: req.user?.id || "admin" },
        $push: { states: { state: "Aceptado", createdAt: now } },
      }
    );

    // Notificar al cliente
    const cliente = await db.collection(nameCollections.admin).findOne({ id: pago.user_id });
    if (cliente?.email) {
      try {
        await sendMail(
          cliente.email,
          "Pago confirmado ✅",
          `Hola ${cliente.firstNames},

Tu pago de ${pago.amount} ${pago.plan?.currencySymbol || ""} ha sido confirmado.

Saludos,
${process.env.NAME_APP || "SVION"}`
        );
      } catch (e) { console.warn("confirmPayment: email no enviado:", e.message); }
    }

    logFromReq(req, "confirm_payment", payment_id, "payment", { user_id: pago.user_id, amount: pago.amount });
    return res.status(200).json({ code: "confirmado", message: "✅ Pago confirmado" });
  } catch (err) {
    console.error("paymentController.confirmPayment:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/payments/reject  — Admin rechaza un pago
// body: { payment_id, reason }
// ═══════════════════════════════════════════════════════════════════════════════
async function rejectPayment(req, res) {
  try {
    const { payment_id, reason } = req.body;
    if (!payment_id) return res.status(400).json({ code: "faltan_datos", message: "payment_id requerido" });
    const db   = getDB();
    const pago = await db.collection(nameCollections.payments).findOne({ id: payment_id });
    if (!pago) return res.status(404).json({ code: "no_encontrado", message: "Pago no encontrado" });

    const now = new Date();
    await db.collection(nameCollections.payments).updateOne(
      { id: payment_id },
      {
        $set: { state: "Devuelto", rejectedAt: now, note: reason || pago.note || "" },
        $push: { states: { state: "Devuelto", createdAt: now } },
      }
    );

    // Notificar al cliente
    const cliente = await db.collection(nameCollections.admin).findOne({ id: pago.user_id });
    if (cliente?.email) {
      try {
        await sendMail(
          cliente.email,
          "Pago rechazado",
          `Hola ${cliente.firstNames},

Tu pago no pudo ser procesado.${reason ? "\nMotivo: " + reason : ""}\n\nContacta soporte si tienes dudas.\n\nSaludos,\n${process.env.NAME_APP || "SVION"}`
        );
      } catch (e) { console.warn("rejectPayment: email no enviado:", e.message); }
    }

    logFromReq(req, "reject_payment", payment_id, "payment", { reason: reason || "" });
    return res.status(200).json({ code: "rechazado", message: "✅ Pago rechazado" });
  } catch (err) {
    console.error("paymentController.rejectPayment:", err);
    return res.status(500).json({ code: "error", message: err.message });
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/payments/crypto/create-invoice
// Crea una factura/invoice en la pasarela crypto elegida
// body: { payment_id, method, amount_usd, amount_usdt, description? }
// ═══════════════════════════════════════════════════════════════════════════════
async function createCryptoInvoice(req, res) {
  try {
    const { payment_id, method, amount_usd, amount_usdt, description } = req.body;
    if (!payment_id || !method) {
      return res.status(400).json({ code: "faltan_datos", message: "payment_id y method son requeridos" });
    }

    const db   = getDB();
    const pago = await db.collection(nameCollections.payments).findOne({ id: payment_id });
    if (!pago) return res.status(404).json({ code: "no_encontrado", message: "Pago no encontrado" });

    const { createCryptoPayment } = require("../services/cryptoService");
    const invoice = await createCryptoPayment({
      method,
      amountUsd:  amount_usd  || pago.amount || 0,
      amountUsdt: amount_usdt || pago.amount || 0,
      paymentId:  payment_id,
      description: description || `VPN - ${pago.plan?.plan_title_name || "Service"}`,
    });

    // Guardar datos del invoice en el pago
    await db.collection(nameCollections.payments).updateOne(
      { id: payment_id },
      { $set: {
          crypto_invoice: invoice,
          crypto_method: method,
          updatedAt: new Date(),
          ...(invoice.invoice_id && { [`${invoice.provider}_invoice_id`]: invoice.invoice_id }),
        }
      }
    );

    return res.status(200).json({
      code:    "invoice_creado",
      message: "✅ Factura crypto creada",
      data:    invoice,
    });
  } catch (e) {
    console.error("paymentController.createCryptoInvoice:", e);
    return res.status(500).json({ code: "error", message: e.message });
  }
}

module.exports = { hacerpago, hacerpagoInicial, editarpago, getPaymentsToAdmin, getPaymentsFromClient, hacerpagoAdmin, confirmPayment, rejectPayment, createCryptoInvoice };
