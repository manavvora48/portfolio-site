/**
 * Serverless Contact Proxy Endpoint (/api/contact)
 * Keeps WEB3FORMS_ACCESS_KEY strictly on the server (in process.env.WEB3FORMS_ACCESS_KEY)
 * so the raw API key never has to be exposed to the browser client.
 */

function sanitizeSingleLine(str, maxLen) {
  return String(str || '')
    .replace(/[\r\n\0\t<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen || 120);
}

function sanitizeMultilineText(str, maxLen) {
  return String(str || '')
    .replace(/\0/g, '')
    .replace(/[<>]/g, '')
    .trim()
    .slice(0, maxLen || 2000);
}

function isValidEmail(email) {
  if (!email || email.length < 5 || email.length > 120) return false;
  if (/[\r\n\0<>"'(),;:\\[\]\s]/.test(email)) return false;
  return /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/.test(email);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ success: false, message: 'Method Not Allowed' });
  }

  const serverApiKey = process.env.WEB3FORMS_ACCESS_KEY;
  if (!serverApiKey) {
    return res.status(503).json({
      success: false,
      message: 'Server environment variable WEB3FORMS_ACCESS_KEY is not configured.'
    });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});

    // Silently reject honeypot spam
    if (body.botcheck && String(body.botcheck).trim() !== '') {
      return res.status(200).json({ success: true });
    }

    const name = sanitizeSingleLine(body.name, 80);
    const email = sanitizeSingleLine(body.email, 120);
    const message = sanitizeMultilineText(body.message, 2000);

    if (!name || name.length < 2 || !isValidEmail(email) || !message || message.length < 5) {
      return res.status(400).json({
        success: false,
        message: 'Invalid name, email, or message payload.'
      });
    }

    const upstreamRes = await fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      },
      body: JSON.stringify({
        access_key: serverApiKey.trim(),
        from_name: name + ' — Portfolio Contact',
        subject: "Let's Create Something — Inquiry from " + name,
        replyto: email,
        name: name,
        email: email,
        message: message,
        botcheck: ''
      })
    });

    const data = await upstreamRes.json().catch(() => ({}));
    return res.status(upstreamRes.status).json(data);
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Internal server error while delivering message.'
    });
  }
};

