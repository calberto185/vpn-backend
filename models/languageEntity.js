const { v4: uuidv4 } = require('uuid');

/**
 * Represents a UI language available in the system.
 * Collection: languages
 */
class LanguageEntity {
  id         = '';
  code       = '';        // ISO 639-1  e.g. 'es', 'en', 'ru'
  name       = '';        // English name: 'Spanish', 'English', 'Russian'
  nativeName = '';        // Native name: 'Español', 'English', 'Русский'
  flag       = '';        // Emoji flag
  isActive   = true;      // visible to end-users
  isDefault  = false;     // fallback language for missing translations
  order      = 0;         // display order
  createdAt  = new Date();
  updatedAt  = new Date();

  constructor() {}

  set({ id, code, name, nativeName, flag, isActive, isDefault, order, createdAt, updatedAt } = {}) {
    if (id         !== undefined) this.id         = id;
    if (code       !== undefined) this.code       = code;
    if (name       !== undefined) this.name       = name;
    if (nativeName !== undefined) this.nativeName = nativeName;
    if (flag       !== undefined) this.flag       = flag;
    if (isActive   !== undefined) this.isActive   = isActive;
    if (isDefault  !== undefined) this.isDefault  = isDefault;
    if (order      !== undefined) this.order      = order;
    if (createdAt  !== undefined) this.createdAt  = createdAt;
    if (updatedAt  !== undefined) this.updatedAt  = updatedAt;
  }

  get() {
    return {
      id:         this.id || uuidv4(),
      code:       this.code,
      name:       this.name,
      nativeName: this.nativeName,
      flag:       this.flag,
      isActive:   this.isActive,
      isDefault:  this.isDefault,
      order:      this.order,
      createdAt:  this.createdAt,
      updatedAt:  this.updatedAt,
    };
  }
}

module.exports = LanguageEntity;
