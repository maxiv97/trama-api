// Runs before each e2e file loads AppModule: force the mailer into mock mode so tests never hit the
// real Brevo API, regardless of a local .env (@nestjs/config does not override already-set env vars).
process.env.BREVO_API_KEY = '';
