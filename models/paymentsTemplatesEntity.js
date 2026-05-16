const CountryEntity = require("./countryEntity");
class ServicesEntity {
  id = "";
  name = "";
  description = "";
  service_id = "";
  html = "";
  state = false;
  createdAt = new Date();
  updateAt = new Date();

  
  constructor() {}
  set({ 
    id,
    name,
    description,
    service_id,
    html,
    state,
    createdAt,
    updateAt
  }) {
    this.id = id ?? this.id;
    this.name = name ?? this.name;
    this.description = description ?? this.description;
    this.service_id = service_id ?? this.service_id;
    this.state = state ?? this.state;
    this.html = html ?? this.html;
    this.createdAt = createdAt ?? this.createdAt;
    this.updateAt = updateAt ?? this.updateAt;
  }
  get() {
    if(!this.name) throw new Error('The name field is required!.');
    if(!this.description) throw new Error('The description field is required!.');
    if(!this.html) throw new Error('The html field is required!.');
    return this;
  }
}

module.exports = ServicesEntity;
