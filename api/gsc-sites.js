export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const authorization = req.headers.authorization;
  if (!authorization?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Google sign-in required' });
  }

  try {
    const response = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
      headers: { Authorization: authorization },
    });
    const data = await response.json();
    if (!response.ok) {
      return res.status(response.status).json(data);
    }

    return res.status(200).json({
      siteEntry: (data.siteEntry || []).map(({ siteUrl, permissionLevel }) => ({
        siteUrl,
        permissionLevel,
      })),
    });
  } catch {
    return res.status(502).json({ error: 'Could not reach Google Search Console' });
  }
}
