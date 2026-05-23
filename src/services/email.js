const nodemailer = require('nodemailer');
const config = require('../config');

function isEmailConfigured() {
  return Boolean(config.email.host && config.email.user && config.email.pass && config.email.from);
}

function createTransport() {
  return nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    auth: {
      user: config.email.user,
      pass: config.email.pass
    }
  });
}

async function sendMail({ to, subject, text, html }) {
  if (!isEmailConfigured()) {
    const err = new Error('Email is not configured');
    err.statusCode = 501;
    throw err;
  }

  const transport = createTransport();
  await transport.sendMail({
    from: config.email.from,
    to,
    subject,
    text,
    html
  });
}

module.exports = { isEmailConfigured, sendMail };

