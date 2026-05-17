import "isomorphic-fetch";
import { Client, AuthenticationProvider } from "@microsoft/microsoft-graph-client";
import { getAppToken, getDelegatedToken } from "./auth";

function makeClient(getToken: () => Promise<string>): Client {
  const authProvider: AuthenticationProvider = {
    getAccessToken: getToken,
  };
  return Client.initWithMiddleware({ authProvider });
}

export async function getAppClient(): Promise<Client> {
  return makeClient(getAppToken);
}

export async function getDelegatedClient(): Promise<Client> {
  return makeClient(getDelegatedToken);
}
