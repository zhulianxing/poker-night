// shared/index.js — 统一导出
const db = require('./db');
const constants = require('./constants');
const mailer = require('./mailer');

module.exports = {
  ...db,        // pool, query, getClient
  ...constants, // TOURNAMENT_STATUS, PLAYER_STATUS, etc.
  mailer,       // sendCode
  db,           // 兼容 db.pool / db.query
  constants,    // 兼容 constants.TOURNAMENT_STATUS
};
