import * as msal from "@azure/msal-node";
import { config } from "@/lib/config";

// ---------------------------------------------------------------
// MSAL application instance (shared, lazy-init)
// ---------------------------------------------------------------

let _msalApp: msal.ConfidentialClientApplication | null = null;

function getMsalApp(): msal.ConfidentialClientApplication {
  if (_msalApp) return _msalApp;
  _msalApp = new msal.ConfidentialClientApplication({
    auth: {
      clientId: config.ms.clientId,
      clientSecret: config.ms.clientSecret,
      authority: `https://login.microsoftonline.com/${config.ms.tenantId}`,
    },
  });
  return _msalApp;
}

// ---------------------------------------------------------------
// Application-tier token (client credentials)
// Used for: transcript reads, call records
// ---------------------------------------------------------------

let _appTokenCache: { token: string; expiresAt: number } | null = null;

export async function getAppToken(): Promise<string> {
  if (_appTokenCache && Date.now() < _appTokenCache.expiresAt - 5 * 60_000) {
    return _appTokenCache.token;
  }
  const result = await getMsalApp().acquireTokenByClientCredential({
    scopes: ["https://graph.microsoft.com/.default"],
  });
  if (!result?.accessToken) throw new Error("Failed to acquire app token");
  _appTokenCache = {
    token: result.accessToken,
    expiresAt: result.expiresOn?.getTime() ?? Date.now() + 55 * 60_000,
  };
  return _appTokenCache.token;
}

// ---------------------------------------------------------------
// Delegated token (ROPC — acting as Bot User)
// Used for: sending chat messages, reading chats, reading meetings
// ---------------------------------------------------------------

let _delegatedTokenCache: { token: string; expiresAt: number } | null = null;

export async function getDelegatedToken(): Promise<string> {
  if (
    _delegatedTokenCache &&
    Date.now() < _delegatedTokenCache.expiresAt - 5 * 60_000
  ) {
    return _delegatedTokenCache.token;
  }

  // MSAL Node doesn't expose ROPC directly, so we call the token endpoint manually.
  const params = new URLSearchParams({
    client_id: config.ms.clientId,
    client_secret: config.ms.clientSecret,
    scope:
      "https://graph.microsoft.com/Chat.ReadWrite https://graph.microsoft.com/ChatMessage.Send https://graph.microsoft.com/OnlineMeetings.Read https://graph.microsoft.com/User.Read offline_access",
    grant_type: "password",
    username: config.ms.botUserEmail,
    password: config.ms.botUserPassword,
  });

  const res = await fetch(
    `https://login.microsoftonline.com/${config.ms.tenantId}/oauth2/v2.0/token`,
    { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`ROPC token request failed (${res.status}): ${body}`);
  }

  const json = await res.json() as { access_token: string; expires_in: number };
  _delegatedTokenCache = {
    token: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  };
  return _delegatedTokenCache.token;
}
