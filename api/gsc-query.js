export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { siteInput, ...gscBody } = req.body;

  const isUrl = siteInput.startsWith('http://') || siteInput.startsWith('https://');
  const siteUrl = isUrl
    ? encodeURIComponent(siteInput)
    : `sc-domain:${siteInput.replace(/^www\./, '')}`;

  try {
    const gscResponse = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${siteUrl}/searchAnalytics/query`, {
      method: 'POST',
      headers: {
        Authorization: req.headers.authorization || '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(gscBody),
    });

    const result = await gscResponse.json();

    res.status(200).json({
      info: isUrl ? `✅ URL encoded to: ${siteUrl}` : `✅ Using domain: ${siteUrl}`,
      result,
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch GSC data', details: err.message });
  }
}
