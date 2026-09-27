import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { z } from 'zod';

const issuer = 'https://gscinsinghts.us.auth0.com/';
const audience = 'https://seo-data-insights.vercel.app/mcp';
const scope = 'gsc:read';
const metadata = `${audience.replace(/\/mcp$/, '')}/.well-known/oauth-protected-resource`;
const jwks = createRemoteJWKSet(new URL(`${issuer}.well-known/jwks.json`));

async function googleToken(auth0Token) {
  const response = await fetch(`${issuer}oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.AUTH0_API_CLIENT_ID,
      client_secret: process.env.AUTH0_API_CLIENT_SECRET,
      subject_token: auth0Token,
      grant_type: 'urn:auth0:params:oauth:grant-type:token-exchange:federated-connection-access-token',
      subject_token_type: 'urn:ietf:params:oauth:token-type:access_token',
      requested_token_type: 'http://auth0.com/oauth/token-type/federated-connection-access-token',
      connection: 'google-oauth2',
    }),
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error('Connect Google Search Console in Auth0 to grant read-only access.');
  if (!data.scope?.split(' ').includes('https://www.googleapis.com/auth/webmasters.readonly')) {
    throw new Error('Google has not granted Search Console read-only access. Reconnect with that permission.');
  }
  return data.access_token;
}

function createServer(auth0Token) {
  const server = new McpServer({ name: 'search-console-insights', version: '0.1.0' });
  server.registerTool('list_gsc_properties', {
    description: 'List Google Search Console properties for the connected Google account.',
    inputSchema: {},
  }, async () => {
    try {
      const token = await googleToken(auth0Token);
      const response = await fetch('https://www.googleapis.com/webmasters/v3/sites', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Search Console could not list properties.');
      return { content: [{ type: 'text', text: JSON.stringify(data.siteEntry || []) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error.message }] };
    }
  });
  server.registerTool('query_gsc_performance', {
    description: 'Read Search Analytics performance for a selected property. Use the exact siteUrl returned by list_gsc_properties.',
    inputSchema: {
      siteUrl: z.string().min(1),
      startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      dimensions: z.array(z.enum(['date', 'query', 'page', 'country', 'device', 'searchAppearance'])).default([]),
      rowLimit: z.number().int().min(1).max(25000).default(1000),
    },
  }, async ({ siteUrl, startDate, endDate, dimensions, rowLimit }) => {
    try {
      const token = await googleToken(auth0Token);
      const response = await fetch('https://searchconsole.googleapis.com/webmasters/v3/sites/' + encodeURIComponent(siteUrl) + '/searchAnalytics/query', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ startDate, endDate, dimensions, rowLimit, dataState: 'final' }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message || 'Search Console query failed.');
      return { content: [{ type: 'text', text: JSON.stringify(data) }] };
    } catch (error) {
      return { isError: true, content: [{ type: 'text', text: error.message }] };
    }
  });
  return server;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://chatgpt.com');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, MCP-Protocol-Version, Mcp-Session-Id');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (!process.env.AUTH0_API_CLIENT_ID || !process.env.AUTH0_API_CLIENT_SECRET) {
    return res.status(503).json({ error: 'Token Vault is not configured' });
  }
  const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
  const challenge = `Bearer resource_metadata="${metadata}", scope="${scope}"`;
  if (!token) {
    res.setHeader('WWW-Authenticate', challenge);
    return res.status(401).json({ error: 'Authentication required' });
  }
  try {
    const { payload } = await jwtVerify(token, jwks, { issuer, audience });
    if (!payload.scope?.split(' ').includes(scope)) throw new Error('Missing scope');
  } catch {
    res.setHeader('WWW-Authenticate', challenge);
    return res.status(401).json({ error: 'Invalid access token' });
  }
  const server = createServer(token);
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close().catch(() => {}); server.close().catch(() => {}); });
  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch {
    if (!res.headersSent) res.status(500).json({ error: 'MCP request failed' });
  }
}
