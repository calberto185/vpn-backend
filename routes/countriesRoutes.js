const express = require("express");
const router = express.Router();
const { verifyToken }     = require('../middlewares/verifyTokenMiddleware');
const { checkPermission } = require('../middlewares/checkPermissionMiddleware');
const { getCountries, createCountry, editCountry, deleteCountry } = require("../controllers/countryController");

/** Public — used by signup/public pages */
router.get("/", getCountries);

router.post("/",   verifyToken, checkPermission('settings/countries', 'create'), createCountry);
router.put("/",    verifyToken, checkPermission('settings/countries', 'update'), editCountry);
router.delete("/", verifyToken, checkPermission('settings/countries', 'delete'), deleteCountry);

module.exports = router;
