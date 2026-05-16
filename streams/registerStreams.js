const { AdminStream } = require("./admin.stream");
const { AuthStream } = require("./auth.stream");
const { nameCollections } = require("../config/db.config")

async function registerStreams(db) {
  try {
    const changeStream = db.watch([], { fullDocument: "updateLookup" });
    console.log("👂 Escuchando cambios en la base de datos...");
    changeStream.on("change", async (change) => {
      try {
        if (change.ns.coll === nameCollections.admin) {
          await AdminStream(db, change);
          await AuthStream(db, change);
        } 
        // else if (change.ns.coll === nameCollections.devices) {
        //   await AuthStream(db, change);
        // }
      } catch (err) {
        console.error("⚠️ Error al procesar el cambio:", err);
      }
    });

    changeStream.on("error", (error) => {
      console.error("💥 Error en el stream de MongoDB:", error);
      // Opcional: intentar reiniciar el stream
      setTimeout(() => registerStreams(db), 5000);
    });
  } catch (err) {
    console.error("❌ No se pudo iniciar el stream:", err);
  }
}

module.exports = { registerStreams };
