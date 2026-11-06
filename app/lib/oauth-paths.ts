// Exact public entry points. Each handler authenticates its own protocol requests.
export function oauthPublicPath(path: string) {
  return ["/mcp", "/oauth/authorize", "/oauth/token", "/oauth/register", "/oauth/revoke",
    "/.well-known/oauth-authorization-server", "/.well-known/oauth-protected-resource",
    "/.well-known/oauth-protected-resource/mcp"].includes(path);
}
