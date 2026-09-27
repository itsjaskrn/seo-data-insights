export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Google sign-in required' });
  }

  const { siteInput, startDate, endDate, dimensions = [], rowLimit, dataState } = req.body || {};
  if (typeof siteInput !== 'string' || !siteInput.trim() ||
      typeof startDate !== 'string' || typeof endDate !== 'string' ||
      !Array.isArray(dimensions) || !dimensions.every(value => typeof value === 'string')) {
    return res.status(400).json({ error: 'Valid siteInput, startDate, endDate, and dimensions are required' });
  }

  const input = siteInput.trim();
  const isUrl = /^https?:\/\//i.test(input);
  const siteUrl = isUrl ? input : input.startsWith('sc-domain:')
    ? input : `sc-domain:${input.replace(/^www\./, '')}`;

  const body = { startDate, endDate, dimensions };
  if (rowLimit !== undefined) body.rowLimit = rowLimit;
  if (dataState !== undefined) body.dataState = dataState;

  try {
    const response = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: { Authorization: authorization, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );
    const result = await response.json();
    return res.status(response.status).json(result);
  } catch {
    return res.status(502).json({ error: 'Could not reach Google Search Console' });
  }
}
