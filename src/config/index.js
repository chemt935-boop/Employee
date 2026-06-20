require('dotenv').config();

const { loadEnv } = require('./env');

const env = loadEnv(process.env);

module.exports = {
  env,
  port: env.PORT,
  authMode: env.AUTH_MODE,
  jwt: {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN
  },
  appBaseUrl: env.APP_BASE_URL,
  passwordReset: {
    ttlMinutes: env.PASSWORD_RESET_TOKEN_TTL_MINUTES,
    returnTokenInResponse: env.EMAIL_RETURN_TOKEN_IN_RESPONSE
  },
  email: {
    apiKey: env.RESEND_API_KEY || null,
    from: env.EMAIL_FROM || null
  },
  firebase: {
    serviceAccountJsonPath: env.FIREBASE_SERVICE_ACCOUNT_JSON || null
  },
  db: {
    server: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    options: {
      encrypt: env.DB_ENCRYPT,
      trustServerCertificate: env.DB_TRUST_SERVER_CERT
    },
    pool: {
      max: 10,
      min: 0,
      idleTimeoutMillis: 30000
    }
  }
}