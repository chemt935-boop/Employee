const nodemailer = require('nodemailer');
const dns = require('dns').promises;
const config = require('../config');

function isEmailConfigured() {
  return Boolean(
    config.email.host &&
    config.email.user &&
    config.email.pass &&
    config.email.from
  );
}

async function createTransport() {

  console.log('EMAIL CONFIG:', {
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    user: config.email.user,
    passLength: config.email.pass?.length
  });

  try {
    const dnsResult = await dns.lookup(config.email.host);
    console.log('DNS RESULT:', dnsResult);
  } catch (e) {
    console.error('DNS ERROR:', e);
  }

  const transport = nodemailer.createTransport({
    host: config.email.host,
    port: Number(config.email.port),
    secure: config.email.secure === true || config.email.secure === 'true',
    auth: {
      user: config.email.user,
      pass: config.email.pass
    },
    connectionTimeout: 30000,
    greetingTimeout: 30000,
    socketTimeout: 30000
  });

  try {
    await transport.verify();
    console.log('SMTP VERIFIED');
  } catch (e) {
    console.error('SMTP VERIFY ERROR:', e);
  }

  return transport;
}

async function sendMail({ to, subject, text, html }) {
  if (!isEmailConfigured()) {
    const err = new Error('Email is not configured');
    err.statusCode = 501;
    throw err;
  }

  const transport = await createTransport();

  await transport.sendMail({
    from: config.email.from,
    to,
    subject,
    text,
    html
  });
}

module.exports = { isEmailConfigured, sendMail };
