const ContinentsEntity = require("./continentsEntity");

class AppsEntity {
  name = "";
  description = "";
  route = "";
  access = "";
  kind = "";
  queries = 0;
  active = false;
  createdAt = new Date();
  updatedAt = new Date();

  
  constructor() {}
  set({ 
    id,
    name,
    description,
    route,
    access,
    kind,
    queries,
    active,
    createdAt,
    updatedAt,
  }) {
    this.id = id ?? this.id;
    this.name = name ?? this.name;
    this.description = description ?? this.description;
    this.route = route ?? this.route;
    this.kind = kind ?? this.kind;
    this.access = access ?? this.access;
    this.queries = queries ?? this.queries;
    this.active = active ?? this.active;
    this.createdAt = createdAt ?? this.createdAt;
    this.updatedAt = updatedAt ?? this.updatedAt;
  }
  get() {
    if(!this.id) throw new Error('The id field is required!.');
    if(!this.name) throw new Error('The name field is required!.');
    if(!this.description) throw new Error('The description field is required!.');
    if(!this.route) throw new Error('The route field is required!.');
    if(!this.kind) throw new Error('The kind field is required!.');
    if(!this.access) throw new Error('The access field is required!.');
    if(!this.queries) throw new Error('The queries field is required!.');
    return this;
  }
}

module.exports = AppsEntity;
