class ActivitiesDeviceEntity {
  id = "";
  user_id = "";
  device_id = "";
  server_id = "";
  state = false;
  createdAt = new Date();
  client_ip = "";
  country = "";
  region = "";
  city = "";
  lat = "";
  lon = "";

  
  constructor() {}
  set({ 
    id,
    user_id,
    device_id,
    server_id,
    state,
    createdAt,
    client_ip,
    country,
    region,
    city,
    lat,
    lon,
  }) {
    this.id = id ?? this.id;
    this.user_id = user_id ?? this.user_id;
    this.device_id = device_id ?? this.device_id;
    this.server_id = server_id ?? this.server_id;
    this.state = state ?? this.state;
    this.createdAt = createdAt ?? this.createdAt;
    this.client_ip = client_ip ?? this.client_ip;
    this.country = country ?? this.country;
    this.region = region ?? this.region;
    this.city = city ?? this.city;
    this.lat = lat ?? this.lat;
    this.lon = lon ?? this.lon;
  }
  get() {
    if(!this.user_id) throw new Error('The user_id field is required!.');
    if(!this.device_id) throw new Error('The device_id field is required!.');
    if(!this.server_id) throw new Error('The server_id field is required!.');
    return this;
  }
}

module.exports = ActivitiesDeviceEntity;
