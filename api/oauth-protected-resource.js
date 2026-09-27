export default function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end();
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).json({
    resource: 'https://seo-data-insights.vercel.app/mcp',
    authorization_servers: ['https://gscinsinghts.us.auth0.com/'],
    scopes_supported: ['gsc:read'],
  });
}
