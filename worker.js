
/**
 * POINTO LLC Pawnshop — Discord OAuth + ticket backend
 * Deploy as a Cloudflare Worker.
 *
 * Required Worker variables:
 * DISCORD_CLIENT_ID
 * DISCORD_CLIENT_SECRET
 * DISCORD_BOT_TOKEN
 * DISCORD_GUILD_ID
 * DISCORD_TICKET_CATEGORY_ID
 * DISCORD_ADMIN_ROLE_ID       (optional)
 * DISCORD_REDIRECT_URI        (e.g. https://your-worker.workers.dev/auth/callback)
 * FRONTEND_URL                (e.g. https://radstad12.github.io/vykupek/)
 * SESSION_SECRET              (long random secret)
 * SUPABASE_URL
 * SUPABASE_SERVICE_ROLE_KEY
 */

const encoder = new TextEncoder();

function envRequired(env, name) {
  const value = env[name];
  if (!value) throw new Error(`Missing Worker variable: ${name}`);
  return value;
}

function base64urlEncode(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64urlDecode(value) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, c => c.charCodeAt(0));
}

function encodeJson(value) {
  return base64urlEncode(encoder.encode(JSON.stringify(value)));
}

function decodeJson(value) {
  return JSON.parse(new TextDecoder().decode(base64urlDecode(value)));
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

async function signToken(payload, secret) {
  const body = encodeJson(payload);
  const signature = await crypto.subtle.sign('HMAC', await hmacKey(secret), encoder.encode(body));
  return `${body}.${base64urlEncode(new Uint8Array(signature))}`;
}

async function verifyToken(token, secret) {
  const [body, signature] = String(token || '').split('.');
  if (!body || !signature) throw new Error('Invalid token');
  const valid = await crypto.subtle.verify(
    'HMAC',
    await hmacKey(secret),
    base64urlDecode(signature),
    encoder.encode(body)
  );
  if (!valid) throw new Error('Invalid token');
  const payload = decodeJson(body);
  if (!payload.exp || Date.now() / 1000 > payload.exp) throw new Error('Token expired');
  return payload;
}

function json(data, status = 200, origin = '*') {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'Authorization, Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Vary': 'Origin'
    }
  });
}

function redirect(url) {
  return new Response(null, { status: 302, headers: { Location: url } });
}

function frontendOrigin(env) {
  return env.FRONTEND_URL.replace(/\/+$/, '');
}

function discordHeaders(env, jsonBody = false) {
  const headers = {
    Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`
  };
  if (jsonBody) headers['Content-Type'] = 'application/json';
  return headers;
}

async function discordApi(env, path, init = {}) {
  const response = await fetch(`https://discord.com/api/v10${path}`, {
    ...init,
    headers: {
      ...discordHeaders(env, !!init.body),
      ...(init.headers || {})
    }
  });
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text }; }
  if (!response.ok) {
    throw new Error(`Discord API ${response.status}: ${data?.message || text || 'request failed'}`);
  }
  return data;
}

async function supabaseQuery(env, table, query) {
  const url = `${env.SUPABASE_URL.replace(/\/+$/, '')}/rest/v1/${table}?${query}`;
  const response = await fetch(url, {
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`
    }
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`Supabase ${response.status}: ${text}`);
  return text ? JSON.parse(text) : [];
}

function roleBonusPercent(bonuses, roles) {
  const roleSet = new Set(roles);
  return Math.max(
    0,
    ...bonuses
      .filter(b => b.discord_role_id && roleSet.has(String(b.discord_role_id)))
      .map(b => Number(b.bonus_value || 0))
  );
}

function thresholdBonusPercent(bonuses, subtotal) {
  return Math.max(
    0,
    ...bonuses
      .filter(b => !b.discord_role_id && b.bonus_type === 'percent' && Number(subtotal) >= Number(b.threshold || 0))
      .map(b => Number(b.bonus_value || 0))
  );
}

function money(value) {
  return `$${Number(value || 0).toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function cleanChannelName(value) {
  const name = String(value || 'user')
    .toLowerCase()
    .replace(/[^a-z0-9-_]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
  return name || 'user';
}

async function oauthLogin(request, env) {
  const requestUrl = new URL(request.url);
  const returnUrl = requestUrl.searchParams.get('return') || env.FRONTEND_URL;
  if (!returnUrl.startsWith(frontendOrigin(env))) {
    return new Response('Invalid return URL', { status: 400 });
  }

  const state = await signToken({
    returnUrl,
    exp: Math.floor(Date.now() / 1000) + 600
  }, env.SESSION_SECRET);

  const params = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    response_type: 'code',
    redirect_uri: env.DISCORD_REDIRECT_URI,
    scope: 'identify',
    state
  });

  return redirect(`https://discord.com/oauth2/authorize?${params}`);
}

async function oauthCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return new Response('Missing OAuth parameters', { status: 400 });

  let statePayload;
  try {
    statePayload = await verifyToken(state, env.SESSION_SECRET);
  } catch {
    return new Response('Invalid or expired OAuth state', { status: 400 });
  }

  const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: env.DISCORD_REDIRECT_URI
    })
  });
  const tokenData = await tokenResponse.json();
  if (!tokenResponse.ok) {
    return new Response(`Discord OAuth failed: ${tokenData?.error_description || tokenResponse.status}`, { status: 400 });
  }

  const userResponse = await fetch('https://discord.com/api/v10/users/@me', {
    headers: { Authorization: `Bearer ${tokenData.access_token}` }
  });
  const user = await userResponse.json();
  if (!userResponse.ok) return new Response('Unable to read Discord user', { status: 400 });

  const member = await discordApi(env, `/guilds/${env.DISCORD_GUILD_ID}/members/${user.id}`);
  const roles = Array.isArray(member.roles) ? member.roles.map(String) : [];

  const session = await signToken({
    sub: user.id,
    user: {
      id: user.id,
      username: user.username,
      global_name: user.global_name || user.username,
      avatar: user.avatar || null
    },
    roles,
    exp: Math.floor(Date.now() / 1000) + 86400
  }, env.SESSION_SECRET);

  const target = `${statePayload.returnUrl.replace(/#.*$/, '')}#discord_session=${encodeURIComponent(session)}`;
  return redirect(target);
}

async function requireSession(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  return verifyToken(token, env.SESSION_SECRET);
}

async function handleMe(request, env, origin) {
  const session = await requireSession(request, env);
  const bonuses = await supabaseQuery(
    env,
    'bonuses',
    'select=bonus_type,bonus_value,discord_role_id,active&active=eq.true'
  );
  const bonusPercent = roleBonusPercent(bonuses, session.roles || []);
  return json({
    user: session.user,
    roles: session.roles || [],
    bonusPercent,
    isAdmin: !!env.DISCORD_ADMIN_ROLE_ID && (session.roles || []).includes(String(env.DISCORD_ADMIN_ROLE_ID))
  }, 200, origin);
}

async function handleTicket(request, env, origin) {
  const session = await requireSession(request, env);
  const body = await request.json();
  const requested = Array.isArray(body.items) ? body.items : [];
  if (!requested.length) return json({ error: 'Vyber alespoň jeden produkt.' }, 400, origin);
  if (requested.length > 50) return json({ error: 'Příliš mnoho položek.' }, 400, origin);

  const ids = [...new Set(requested.map(x => String(x.id)))];
  const products = [];
  for (const id of ids) {
    const rows = await supabaseQuery(
      env,
      'products',
      `select=id,name,price,active,required_role_id&id=eq.${encodeURIComponent(id)}`
    );
    if (rows[0]) products.push(rows[0]);
  }

  const productMap = new Map(products.map(p => [String(p.id), p]));
  const items = [];
  let subtotal = 0;

  for (const requestedItem of requested) {
    const product = productMap.get(String(requestedItem.id));
    const quantity = Math.max(0, Math.min(9999, Number.parseInt(requestedItem.quantity, 10) || 0));
    if (!product || !product.active || quantity < 1) continue;
    if (product.required_role_id && !(session.roles || []).includes(String(product.required_role_id))) {
      return json({ error: `Na tento produkt nemáš potřebnou Discord roli.` }, 403, origin);
    }
    const unitPrice = Number(product.price || 0);
    const lineTotal = unitPrice * quantity;
    subtotal += lineTotal;
    items.push({
      id: String(product.id),
      name: product.name,
      quantity,
      unitPrice,
      lineTotal
    });
  }

  if (!items.length) return json({ error: 'Vybrané položky už nejsou dostupné.' }, 400, origin);

  const bonuses = await supabaseQuery(
    env,
    'bonuses',
    'select=threshold,bonus_type,bonus_value,discord_role_id,active&active=eq.true'
  );
  const roleBonus = roleBonusPercent(bonuses, session.roles || []);
  const tierBonus = thresholdBonusPercent(bonuses, subtotal);
  const bonusPercent = Math.max(roleBonus, tierBonus);
  const bonusValue = subtotal * (bonusPercent / 100);
  const total = subtotal + bonusValue;

  const botUser = await discordApi(env, '/users/@me');
  const everyoneAllow = 0;
  const userAllow = 1024 + 2048 + 16 + 65536 + 16384;

  const channel = await discordApi(env, `/guilds/${env.DISCORD_GUILD_ID}/channels`, {
    method: 'POST',
    body: JSON.stringify({
      name: `ticket-${cleanChannelName(session.user.username)}-${String(session.user.id).slice(-4)}`,
      type: 0,
      parent_id: env.DISCORD_TICKET_CATEGORY_ID,
      topic: `POINTO výkup | Discord ${session.user.id}`,
      permission_overwrites: [
        { id: env.DISCORD_GUILD_ID, type: 0, deny: String(1024), allow: String(everyoneAllow) },
        { id: session.user.id, type: 1, deny: '0', allow: String(userAllow) },
        { id: botUser.id, type: 1, deny: '0', allow: String(userAllow) }
      ]
    })
  });

  const lines = items.map(i => `• **${i.name}** × ${i.quantity} — ${money(i.lineTotal)}`).join('\n');
  const content =
    `## 📦 Nový výkup\n` +
    `Zákazník: <@${session.user.id}> (${session.user.username})\n\n` +
    `${lines}\n\n` +
    `**Mezisoučet:** ${money(subtotal)}\n` +
    `**Bonus:** +${bonusPercent}% (${money(bonusValue)})\n` +
    `**Orientační výkup:** **${money(total)}**\n\n` +
    `Ticket vytvořen přes POINTO Pawnshop.`;

  await discordApi(env, `/channels/${channel.id}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content })
  });

  return json({
    ok: true,
    channelId: channel.id,
    channelUrl: `https://discord.com/channels/${env.DISCORD_GUILD_ID}/${channel.id}`,
    subtotal,
    bonusPercent,
    bonusValue,
    total
  }, 200, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const allowedOrigin = frontendOrigin(env);
    const corsOrigin = origin === allowedOrigin ? origin : allowedOrigin;

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': corsOrigin,
          'Access-Control-Allow-Headers': 'Authorization, Content-Type',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Vary': 'Origin'
        }
      });
    }

    try {
      const url = new URL(request.url);

      if (url.pathname === '/auth/login' && request.method === 'GET') {
        return oauthLogin(request, env);
      }

      if (url.pathname === '/auth/callback' && request.method === 'GET') {
        return oauthCallback(request, env);
      }

      if (url.pathname === '/api/me' && request.method === 'GET') {
        return handleMe(request, env, corsOrigin);
      }

      if (url.pathname === '/api/tickets' && request.method === 'POST') {
        return handleTicket(request, env, corsOrigin);
      }

      return json({ error: 'Not found' }, 404, corsOrigin);
    } catch (error) {
      console.error(error);
      return json({ error: error?.message || 'Internal server error' }, 500, corsOrigin);
    }
  }
};
