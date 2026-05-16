const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/verifyTokenMiddleware');
const { checkRole }   = require('../middlewares/verifyRoleMiddleware');
const {
  getLanguages,
  createLanguage,
  updateLanguage,
  deleteLanguage,
} = require('../controllers/languageController');

// Public: returns active languages (used by frontend for the language selector)
router.get('/', getLanguages);

// Admin only: full CRUD
router.post('/',    verifyToken, checkRole('admin'), createLanguage);
router.put('/',     verifyToken, checkRole('admin'), updateLanguage);
router.delete('/:id', verifyToken, checkRole('admin'), deleteLanguage);

module.exports = router;
