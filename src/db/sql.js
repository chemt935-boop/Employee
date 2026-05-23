const mssql = require('mssql');
const config = require('../config');

let poolPromise;

function getPool() {
  if (!poolPromise) {
    poolPromise = mssql.connect(config.db);
  }
  return poolPromise;
}

async function query(text, params = {}) {
  const pool = await getPool();
  const request = pool.request();
  for (const [key, value] of Object.entries(params)) {
    request.input(key, value);
  }
  const result = await request.query(text);
  return result;
}

async function ping() {
  const result = await query('SELECT 1 AS ok');
  return result.recordset?.[0]?.ok === 1;
}

module.exports = { mssql, getPool, query, ping };
