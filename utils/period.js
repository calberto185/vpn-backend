const dayjs = require("dayjs");
function generarRangoFechas(fechaInicio = new Date(), fechaFin = new Date()) {
  const meses = [
    "ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO",
    "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"
  ];

  const inicio = new Date(fechaInicio);
  let fin = new Date(fechaFin).setMonth();

  if (fin < inicio) {
    console.warn("⚠️ La fecha final es menor que la inicial. Se ajustará a la fecha de inicio.");
    fin = new Date(inicio);
  }

  const mesInicio = meses[inicio.getMonth()];

  const formato = (f) => {
    const dia = String(f.getDate()).padStart(2, "0");
    const mes = String(f.getMonth() + 1).padStart(2, "0");
    const año = f.getFullYear();
    return `${dia}-${mes}-${año}`;
  };

  return `${mesInicio}_${formato(inicio)}_${formato(fin)}`;
}
/**
 * Calcula la siguiente fecha según el tipo solicitado.
 * Tipos válidos: minuto, hora, dia, mes, año (y equivalentes en inglés).
 * @param {Date | string} currentDate - Fecha base.
 * @param {string} type - Tipo de incremento.
 * @returns {Date} Nueva fecha.
 */
function getNextDate(currentDate, type) {
  if (!currentDate || !type) return new Date(-1);

  const d = dayjs(currentDate);

  const map = {
    minuto: ["minute", 1],
    minute: ["minute", 1],

    hora: ["hour", 1],
    hour: ["hour", 1],

    dia: ["day", 1],
    day: ["day", 1],

    semana: ["week", 1],
    week: ["week", 1],

    mes: ["month", 1],
    month: ["month", 1],

    año: ["year", 1],
    ano: ["year", 1],
    year: ["year", 1],
  };

  const entry = map[type.toLowerCase()];
  if (!entry) return new Date(-1);

  const [unit, amount] = entry;
  return d.add(amount, unit).toDate();
}
// Ejemplo sin argumentos (usa la fecha actual)
// console.log(generarRangoFechas());

module.exports = { generarRangoFechas, getNextDate }
// Ejemplo de uso:
// console.log(generarRangoFechas("2025-04-12", "2025-05-12"));
// Resultado: "ABRIL_12-04-2025_12-05-2025"
