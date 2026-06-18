const { Resend } = require('resend');
const config = require('../config');

function isEmailConfigured() {
  return Boolean(
    config.email.apiKey &&
    config.email.from
  );
}

const resend = new Resend(config.email.apiKey);

async function sendMail({ to, subject, text, html }) {
  if (!isEmailConfigured()) {
    const err = new Error('Email is not configured');
    err.statusCode = 501;
    throw err;
  }

  const { data, error } = await resend.emails.send({
    from: config.email.from,
    to: Array.isArray(to) ? to : [to],
    subject,
    text,
    html
  });

  if (error) {
    console.error('RESEND ERROR:', error);
    throw new Error(error.message);
  }

  console.log('EMAIL SENT:', data);

  return data;
}

module.exports = {
  isEmailConfigured,
  sendMail
};
