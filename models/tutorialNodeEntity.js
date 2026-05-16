/**
 * TutorialNodeEntity
 *
 * Represents one node in the tutorial tree.
 * A node can be a top-level category (parentId = null) or a nested sub-level.
 * Each node carries an ordered list of `content` blocks.
 *
 * Content block shape:
 *   { type: 'text'|'image'|'video'|'link'|'button'|'tabs'|'steps', data: { ... } }
 */
class TutorialNodeEntity {
  id          = '';
  parentId    = null;      // null → root-level node
  title       = '';
  icon        = '';        // emoji char or image URL (see iconType)
  iconType    = 'fa';      // 'fa' | 'image'
  description = '';        // optional HTML shown below the node title
  order       = 0;
  isVisible   = true;
  /** @type {Array<{type:string, data:object}>} */
  content     = [];
  createdAt   = new Date();
  updatedAt   = new Date();

  constructor() {}

  set({
    id,
    parentId,
    title,
    icon,
    iconType,
    description,
    order,
    isVisible,
    content,
    createdAt,
    updatedAt,
  }) {
    if (id          !== undefined) this.id          = id;
    if (parentId    !== undefined) this.parentId    = parentId;
    if (title       !== undefined) this.title       = title;
    if (icon        !== undefined) this.icon        = icon;
    if (iconType    !== undefined) this.iconType    = iconType;
    if (description !== undefined) this.description = description;
    if (order       !== undefined) this.order       = order;
    if (isVisible   !== undefined) this.isVisible   = isVisible;
    if (content     !== undefined) this.content     = content;
    if (createdAt   !== undefined) this.createdAt   = createdAt;
    if (updatedAt   !== undefined) this.updatedAt   = updatedAt;
  }

  get() {
    if (!this.id)    throw new Error('id is required');
    if (!this.title) throw new Error('title is required');
    return this;
  }
}

module.exports = TutorialNodeEntity;
