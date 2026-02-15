import https from "https";

const normalizePemFromEnv = (value) =>
  String(value || "")
    .replace(/\\n/g, "\n")
    .replace(/\r/g, "")
    .trim();

const parseJsonSafe = (rawData) => {
  try {
    return JSON.parse(rawData);
  } catch {
    return null;
  }
};

const getExtratoBaseUrl = () =>
  (
    process.env.BRADESCO_EXTRATO_BASE_URL ||
    process.env.BRADESCO_BASE_URL ||
    "https://openapi.bradesco.com.br"
  ).replace(/\/$/, "");

const getExtratoTokenUrl = () =>
  (
    process.env.BRADESCO_EXTRATO_TOKEN_URL ||
    `${getExtratoBaseUrl()}/auth/server-mtls/v2/token`
  ).replace(/\/$/, "");

const getExtratoEndpoint = () =>
  (
    process.env.BRADESCO_EXTRATO_ENDPOINT ||
    `${getExtratoBaseUrl()}/v1/fornecimento-extratos-contas/extratos`
  ).replace(/\/$/, "");

const createBradescoExtratoAgent = () => {
  const certificate = normalizePemFromEnv(
    process.env.BRADESCO_EXTRATO_PUBLIC_CERT ||
      process.env.BRADESCO_PUBLIC_CERT ||
      process.env.BRADESCO_CERTIFICATE
  );
  const privateKey = normalizePemFromEnv(
    process.env.BRADESCO_EXTRATO_PRIVATE_KEY || process.env.BRADESCO_PRIVATE_KEY
  );

  if (!certificate || !privateKey) {
    throw new Error(
      "Certificado/chave do Bradesco Extrato nao configurados (BRADESCO_EXTRATO_PUBLIC_CERT/PRIVATE_KEY)."
    );
  }

  const agentOptions = { cert: certificate, key: privateKey };
  const passphrase =
    process.env.BRADESCO_EXTRATO_PRIVATE_KEY_PASSPHRASE ||
    process.env.BRADESCO_PRIVATE_KEY_PASSPHRASE;
  if (passphrase) agentOptions.passphrase = passphrase;

  return new https.Agent(agentOptions);
};

const extractErrorMessage = (statusCode, rawBody) => {
  const json = parseJsonSafe(rawBody);
  return (
    json?.mensagem ||
    json?.message ||
    json?.detail ||
    json?.error_description ||
    rawBody ||
    `Erro ${statusCode}`
  );
};

export async function getBradescoExtratoAccessToken() {
  const clientId = process.env.BRADESCO_EXTRATO_CLIENT_ID || process.env.BRADESCO_CLIENT_ID;
  const clientSecret =
    process.env.BRADESCO_EXTRATO_CLIENT_SECRET || process.env.BRADESCO_CLIENT_SECRET;
  const scope = process.env.BRADESCO_EXTRATO_SCOPE;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Client ID/Secret do Bradesco Extrato nao configurados (BRADESCO_EXTRATO_CLIENT_ID/CLIENT_SECRET)."
    );
  }

  const tokenPayload = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: clientId,
    client_secret: clientSecret,
    ...(scope ? { scope } : {}),
  }).toString();

  const options = {
    method: "POST",
    agent: createBradescoExtratoAgent(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(tokenPayload),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(getExtratoTokenUrl(), options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const jsonData = parseJsonSafe(data);
        if (res.statusCode >= 200 && res.statusCode < 300 && jsonData?.access_token) {
          resolve(jsonData);
          return;
        }
        reject(
          new Error(
            `Erro ${res.statusCode} ao obter token Bradesco Extrato: ${extractErrorMessage(res.statusCode, data)}`
          )
        );
      });
    });

    req.on("error", (err) =>
      reject(new Error(`Erro de rede ao obter token Bradesco Extrato: ${err.message}`))
    );
    req.write(tokenPayload);
    req.end();
  });
}

export async function consultarExtratoBradesco(accessToken, params) {
  if (!accessToken) throw new Error("Access token do Bradesco Extrato nao informado.");

  const query = new URLSearchParams({
    agencia: String(params.agencia),
    conta: String(params.conta),
    dataInicio: String(params.dataInicio),
    dataFim: String(params.dataFim),
    tipo: String(params.tipo),
    ...(params.tipoOperacao ? { tipoOperacao: String(params.tipoOperacao) } : {}),
  });

  const endpoint = `${getExtratoEndpoint()}?${query.toString()}`;
  const options = {
    method: "GET",
    agent: createBradescoExtratoAgent(),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(endpoint, options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        const jsonData = parseJsonSafe(data);
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(jsonData ?? { raw: data });
          return;
        }
        reject(
          new Error(
            `Erro ${res.statusCode} ao consultar extrato Bradesco: ${extractErrorMessage(res.statusCode, data)}`
          )
        );
      });
    });

    req.on("error", (err) =>
      reject(new Error(`Erro de rede ao consultar extrato Bradesco: ${err.message}`))
    );
    req.end();
  });
}
