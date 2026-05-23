const config = require('./config');
const { logger } = require('./logger');
const { createApp } = require('./app');
const { ping } = require('./db/sql');

const app = createApp();

app.listen(config.port, () => {
  logger.info({ port: config.port, env: config.env.NODE_ENV, authMode: config.authMode }, 'server listening');

  ping()
    .then(() => logger.info({ db: { server: config.db.server, database: config.db.database, port: config.db.port } }, 'db connected'))
    .catch((err) =>
      logger.warn(
        { err, db: { server: config.db.server, database: config.db.database, port: config.db.port } },
        'db connection failed'
      )
    );
});
