const nodemailer = require('nodemailer');
require('dotenv').config({ path: './.env' });

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.ADMIN_EMAIL,
    pass: process.env.ADMIN_APP_PASSWORD
  }
});

transporter.sendMail({
  from: process.env.ADMIN_EMAIL,
  to: process.env.ADMIN_EMAIL,
  subject: 'Test email from Omegle Clone',
  text: 'This is a test email to check if nodemailer is working.'
}, (err, info) => {
  if (err) {
    console.error("FAILED TO SEND:", err.message);
  } else {
    console.log("SUCCESSFULLY SENT:", info.response);
  }
});
