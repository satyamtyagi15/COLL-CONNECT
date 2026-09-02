const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'coder.st.15@gmail.com';
const BREVO_API_KEY = process.env.BREVO_API_KEY;

/**
 * Sends an email using Brevo (Sendinblue) HTTP API.
 * This completely bypasses Render's SMTP port blocks since it uses port 443 (HTTP).
 * Supports sending emails to ANY user.
 */
const sendEmail = async (to, subject, htmlContent) => {
  if (!to) {
    console.error('[Mailer] No recipient email provided');
    return false;
  }

  try {
    const response = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'api-key': BREVO_API_KEY
      },
      body: JSON.stringify({
        sender: {
          name: 'Coll-Connect',
          email: ADMIN_EMAIL
        },
        to: [
          { email: to }
        ],
        subject: subject,
        htmlContent: htmlContent
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[Mailer] FAILED to send email to ${to} via Brevo:`, data);
      return false;
    }

    console.log(`[Mailer] Email sent to ${to} | Brevo MessageId: ${data.messageId}`);
    return true;
  } catch (error) {
    console.error(`[Mailer] FAILED to send email to ${to}:`, error.message);
    return false;
  }
};

module.exports = { sendEmail };
