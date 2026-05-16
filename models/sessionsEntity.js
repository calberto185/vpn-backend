class SessionsEntity {
  id = "";
  user_id = "";
  token = "";
  createdAt = new Date(1);
  expiresAt = new Date(1);
  ip = "";
  userAgent = ""

  
  constructor() {}
  set({ 
    id,
    user_id,
    token,
    createdAt,
    expiresAt,
    ip,
    userAgent,
  }) {
    this.id = id ?? this.id;
    this.user_id = user_id ?? this.user_id;
    this.token = token ?? this.token;
    this.createdAt = createdAt ?? this.createdAt;
    this.expiresAt = expiresAt ?? this.expiresAt;
    this.ip = ip ?? this.ip;
    this.userAgent = userAgent ?? this.userAgent;
  }
  get() {
    if(!this.id) throw new Error('The id field is required!.');
    if(!this.user_id) throw new Error('The user_id field is required!.');
    if(!this.token) throw new Error('The token field is required!.');
    return this;
  }
}

module.exports = SessionsEntity;
