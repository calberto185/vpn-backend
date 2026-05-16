const jwt = require("jsonwebtoken");
require("dotenv").config();

const accessSecret = Buffer.from(process.env.ACCESS_TOKEN_SECRET, "base64");
const refreshSecret = Buffer.from(process.env.REFRESH_TOKEN_SECRET, "base64");

function generateAccessToken(payload) {
  return jwt.sign(payload, accessSecret, {
    expiresIn: process.env.ACCESS_TOKEN_EXPIRATION || "15m",
  });
}

function generateRefreshToken(payload) {
  return jwt.sign(payload, refreshSecret, {
    expiresIn: process.env.REFRESH_TOKEN_EXPIRATION || "7d",
  });
}
function generateTokenApp(payload) {
  return jwt.sign(payload, accessSecret);
}

function verifyAccessToken(token) {
  return jwt.verify(token, accessSecret);
}

function verifyRefreshToken(token) {
  return jwt.verify(token, refreshSecret);
}

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  generateTokenApp
};
