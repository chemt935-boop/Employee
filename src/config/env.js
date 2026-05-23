const Joi = require('joi');

const schema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().integer().min(1).max(65535).default(1433),
  DB_NAME: Joi.string().required(),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').required(),
  DB_ENCRYPT: Joi.boolean().truthy('true').falsy('false').default(false),
  DB_TRUST_SERVER_CERT: Joi.boolean().truthy('true').falsy('false').default(true),

  AUTH_MODE: Joi.string().valid('dev', 'jwt').default('dev'),
  JWT_SECRET: Joi.alternatives()
    .conditional('AUTH_MODE', {
      is: 'jwt',
      then: Joi.string().min(16).required(),
      otherwise: Joi.string().allow('', null).optional()
    })
    .default(''),
  JWT_EXPIRES_IN: Joi.string().default('12h'),

  APP_BASE_URL: Joi.string().uri().default('https://employee-ao8s.onrender.com'),

  PASSWORD_RESET_TOKEN_TTL_MINUTES: Joi.number().integer().min(5).max(24 * 60).default(60),
  EMAIL_RETURN_TOKEN_IN_RESPONSE: Joi.boolean().truthy('true').falsy('false').default(false),

  EMAIL_HOST: Joi.string().allow('', null).optional(),
  EMAIL_PORT: Joi.number().integer().min(1).max(65535).default(587),
  EMAIL_SECURE: Joi.boolean().truthy('true').falsy('false').default(false),
  EMAIL_USER: Joi.string().allow('', null).optional(),
  EMAIL_PASS: Joi.string().allow('', null).optional(),
  EMAIL_FROM: Joi.string().allow('', null).optional(),

  FIREBASE_SERVICE_ACCOUNT_JSON: Joi.string().allow('', null).optional()
}).unknown(true);

function loadEnv(processEnv) {
  const { value, error } = schema.validate(processEnv, { abortEarly: false });
  if (error) {
    const details = error.details.map((d) => d.message).join('; ');
    throw new Error(`Invalid environment variables: ${details}`);
  }
  return value;
}

module.exports = { loadEnv };
