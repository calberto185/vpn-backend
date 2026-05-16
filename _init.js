const { getDB, nameCollections } = require("./services/dbServices");
const adminEntity = require("./models/adminEntity");
const { v4: uuidv4 } = require("uuid");
const { encryptPassword } = require("./utils/encrypt_decrypt");
const CountryEntity = require("./models/countryEntity");
const ContinentsEntity = require("./models/continentsEntity");
const TermsEntity = require("./models/termsEntity");
const { seedDefaultLanguages } = require("./controllers/languageController");
async function addUser() {
    try {
        const exist_Continent = await getDB().collection(nameCollections.continents).findOne({name: "america"});
        const init_continent = new ContinentsEntity();
        if(!!exist_Continent) {
            init_continent.set(exist_Continent);
        } else {
            init_continent.descripcion = "América en general";
            init_continent.displayName = "América";
            init_continent.flag = "🌎";
            init_continent.id =uuidv4();
            init_continent.idiomas = "Spa | Eng";
            init_continent.isActive = true;
            init_continent.name = "america";
            await getDB().collection(nameCollections.continents).insertOne(init_continent);
        }

        const exist_Country = await getDB().collection(nameCollections.countries).findOne({countryCode: "PE"});
        const init_country = new CountryEntity();
        if(!!exist_Country) {
            init_country.set(exist_Country);
        } else {
            init_country.countryCode = "PE";
            init_country.countryName = "Peru";
            init_country.currencyCode = "PEN";
            init_country.currencyFormat = "###,###,###.##";
            init_country.currencyName = "Sol";
            init_country.currencySymbol = "S/.";
            init_country.flag = "🇵🇪",
            init_country.id = uuidv4();
            init_country.isActive = false;
            init_country.languageCode = "es";
            init_country.languageName = "Spanish"
            init_country.phoneCode = "+51";
            init_country.continent = init_continent;
            await getDB().collection(nameCollections.countries).insertOne(init_country);
        }
        
         const exist_terms = await getDB().collection(nameCollections.terms).find({}).toArray();
        const init_terms = new TermsEntity();
        if(!!exist_terms?.length) {
            // init_terms.set(exist_terms);
        } else {
            init_terms.active = true;
            init_terms.country.set(init_country);
            init_terms.createdAt = new Date(); 
            init_terms.description = "Al realizar el pago, confirmas que entiendes y aceptas las siguientes condiciones:";
            init_terms.details = [
                'El acceso es personal, exclusivo y no transferible.',
                'El proveedor mantiene una política estricta de no registro de tráfico (“no logs”).',
                'El uso del servicio con fines ilegales, abusivos o no autorizados (por ejemplo: spam, minería o hacking) provocará la suspensión inmediata de la cuenta.',
                'La velocidad de conexión puede variar según la ubicación, el proveedor de internet o la congestión del servidor.',
                'La asistencia técnica se brinda únicamente a través de los canales oficiales y dentro del horario de soporte establecido.',
                'Los certificados generados son únicos y están vinculados al usuario registrado.',
                'Los reembolsos solo aplican en caso de fallas graves del servicio que no hayan sido corregidas.',
                'El proveedor puede actualizar la red, las políticas o el software sin previo aviso, con el fin de mejorar la seguridad o el rendimiento.',
                'El usuario es responsable de cumplir las leyes locales del país desde el cual utiliza la VPN.'
            ] 
            init_terms.id = uuidv4();
            init_terms.title =  "Terminos y Condiciones";
            init_terms.updatedAt = new Date();
            await getDB().collection(nameCollections.terms).insertOne(init_terms);
        }
        
        const exist_user = await getDB().collection(nameCollections.admin).findOne({email: process.env.ROOT_USER});
        const init_user = new adminEntity();
        if(!exist_user) {
            init_user.id = uuidv4();
            init_user.firstNames = "admin";
            init_user.lastNames = "admin";
            init_user.email = process.env.ROOT_USER;
            init_user.country = init_country;
            init_user.dni = "-";
            init_user.password = await encryptPassword(process.env.ROOT_PASS);
            init_user.isAdmin = true;
            init_user.role = "admin";
            init_user.state = "verificado";
            init_user.verified = true;
            init_user.verifiedAt = new Date();
            init_user.telephone = [];
            await getDB().collection(nameCollections.admin).insertOne(init_user);
        } else {
            init_user.set(exist_user);
            init_user.email = process.env.ROOT_USER;
            init_user.country = init_country;
            init_user.dni = "-";
            init_user.password = await encryptPassword(process.env.ROOT_PASS);
            init_user.isAdmin = true;
            init_user.role = "admin";
            init_user.state = "verificado";
            await getDB().collection(nameCollections.admin).updateOne({id: init_user.id}, {$set: {
                email: init_user.email,
                country: init_user.country,
                dni: init_user.dni,
                password: init_user.password,
                isAdmin: init_user.isAdmin,
                role: init_user.role,
                state: init_user.state,
            }})
        }
        console.log(`✅ [DB] usuario admin creado, USER: ${init_user.email} / PASS: ${process.env.ROOT_PASS}`)
    } catch (error) {
        console.log("addUser: ", error)
    }
}
async function init() {
    await addUser();
    await seedDefaultLanguages();
}
module.exports = { init };