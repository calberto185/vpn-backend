const express = require('express');
const router  = express.Router();
const { verifyToken }  = require('../middlewares/verifyTokenMiddleware');
const { checkRole }    = require('../middlewares/verifyRoleMiddleware');
const {
  getLanguages,
  createLanguage,
  updateLanguage,
  deleteLanguage,
} = require('../controllers/languageController');

// Public — any client can read active languages (for the language selector)
router.get('/',       getLanguages);

// Admin-only mutations
router.post('/',      verifyToken, checkRole('admin'), createLanguage);
router.put('/',       verifyToken, checkRole('admin'), updateLanguage);
router.delete('/:id', verifyToken, checkRole('admin'), deleteLanguage);

module.exports = router;
