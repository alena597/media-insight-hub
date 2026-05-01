import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
});

/**
 * @param {string} to
 * @param {string} resetUrl
 */
export async function sendPasswordResetEmail(to, resetUrl) {
  await transporter.sendMail({
    from: `"Media Insight Hub" <${process.env.GMAIL_USER}>`,
    to,
    subject: 'Password reset',
    html: `
      <p>You requested a password reset for your Media Insight Hub account.</p>
      <p>Click the link below to set a new password. The link is valid for <strong>1 hour</strong>.</p>
      <p><a href="${resetUrl}">${resetUrl}</a></p>
      <p>If you did not request this, ignore this email — your password will not change.</p>
    `,
  });
}
