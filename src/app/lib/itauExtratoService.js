import https from "https";
import { randomUUID } from "crypto";

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

const onlyDigits = (value) => String(value || "").replace(/\D/g, "");

const normalizePositiveInteger = (value) => {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const createItauExtratoAgent = () => {
  const certificate = normalizePemFromEnv(
    process.env.ITAU_EXTRATO_CERTIFICATE || process.env.ITAU_CERTIFICATE
  );
  const privateKey = normalizePemFromEnv(
    process.env.ITAU_EXTRATO_PRIVATE_KEY || process.env.ITAU_PRIVATE_KEY
  );

  if (!certificate || !privateKey) {
    throw new Error(
      "Certificado/chave do ItaÃº Extrato nao configurados (ITAU_EXTRATO_CERTIFICATE/PRIVATE_KEY)."
    );
  }

  const agentOptions = { cert: certificate, key: privateKey };
  const passphrase =
    process.env.ITAU_EXTRATO_PRIVATE_KEY_PASSPHRASE ||
    process.env.ITAU_PRIVATE_KEY_PASSPHRASE;
  if (passphrase) agentOptions.passphrase = passphrase;

  return new https.Agent(agentOptions);
};

const getItauExtratoTokenUrl = () =>
  (process.env.ITAU_EXTRATO_TOKEN_URL || "https://sts.itau.com.br/api/oauth/token").replace(
    /\/$/,
    ""
  );

const getItauExtratoEndpoint = () =>
  (
    process.env.ITAU_EXTRATO_ENDPOINT ||
    "https://account-statement.api.itau.com/account-statement/v1/statements"
  ).replace(/\/$/, "");

const getItauExtratoPageSize = () =>
  normalizePositiveInteger(process.env.ITAU_EXTRATO_PAGE_SIZE) || 1000;

const ITAU_EXTRATO_MAX_PAGES = 50;

const extractErrorMessage = (statusCode, rawBody) => {
  const json = parseJsonSafe(rawBody);
  return (
    json?.mensagem ||
    json?.message ||
    json?.detail ||
    json?.title ||
    json?.error_description ||
    rawBody ||
    `Erro ${statusCode}`
  );
};

const buildStatementId = ({ agencia, conta, dac }) =>
  `${String(agencia)}00${String(conta)}${String(dac)}`;

const buildExtratoQuery = ({ dataInicio, dataFim, type, page, pageSize }) => {
  const query = new URLSearchParams();

  if (type) query.set("type", String(type));
  if (dataInicio) query.set("start_date", String(dataInicio));
  if (dataFim) query.set("end_date", String(dataFim));
  if (normalizePositiveInteger(page)) query.set("page", String(page));
  if (normalizePositiveInteger(pageSize)) query.set("page_size", String(pageSize));

  return query;
};

const parseBooleanLike = (value) => {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  if (typeof value !== "string") return null;

  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "y", "sim"].includes(normalized)) return true;
  if (["false", "0", "no", "n", "nao", "não"].includes(normalized)) return false;
  return null;
};

const firstPositiveInteger = (sources, keys) => {
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;

    for (const key of keys) {
      const value = normalizePositiveInteger(source[key]);
      if (value) return value;
    }
  }

  return null;
};

const firstBooleanLike = (sources, keys) => {
  for (const source of sources) {
    if (!source || typeof source !== "object") continue;

    for (const key of keys) {
      const value = parseBooleanLike(source[key]);
      if (value !== null) return value;
    }
  }

  return null;
};

const resolveNextExtratoPage = ({ payload, currentPage, pageSize, itemCount }) => {
  const paginationSources = [
    payload?.pagination,
    payload?.page,
    payload?.paging,
    payload?.meta?.pagination,
    payload?.meta?.page,
    payload?.meta?.paging,
  ];

  const nextPage = firstPositiveInteger(paginationSources, [
    "next_page",
    "nextPage",
    "proxima_pagina",
    "proximaPagina",
    "page_next",
    "next",
  ]);
  const reportedCurrentPage =
    firstPositiveInteger(paginationSources, [
      "current_page",
      "currentPage",
      "page",
      "page_number",
      "pageNumber",
      "number",
    ]) || currentPage;
  const totalPages = firstPositiveInteger(paginationSources, [
    "total_pages",
    "totalPages",
    "page_count",
    "pageCount",
    "last_page",
    "lastPage",
    "pages",
  ]);
  const hasNext = firstBooleanLike(paginationSources, [
    "has_next",
    "hasNext",
    "next_exists",
    "nextExists",
    "more_pages",
    "morePages",
  ]);

  if (nextPage && nextPage > currentPage) return nextPage;
  if (hasNext === false) return null;
  if (hasNext === true) return reportedCurrentPage + 1;
  if (totalPages && reportedCurrentPage < totalPages) return reportedCurrentPage + 1;
  if (itemCount >= pageSize) return currentPage + 1;
  return null;
};

const requestItauExtratoPage = (endpoint, accessToken) => {
  const options = {
    method: "GET",
    agent: createItauExtratoAgent(),
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      "x-itau-correlationID": randomUUID(),
      "x-itau-flowID": randomUUID(),
      "User-Agent": "FIDCIJJ/1.0",
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
            `Erro ${res.statusCode} ao consultar extrato ItaÃº: ${extractErrorMessage(
              res.statusCode,
              data
            )}`
          )
        );
      });
    });

    req.on("error", (err) =>
      reject(new Error(`Erro de rede ao consultar extrato ItaÃº: ${err.message}`))
    );
    req.end();
  });
};

export async function getItauExtratoAccessToken() {
  const clientId = process.env.ITAU_EXTRATO_CLIENT_ID || process.env.ITAU_CLIENT_ID;
  const clientSecret =
    process.env.ITAU_EXTRATO_CLIENT_SECRET || process.env.ITAU_CLIENT_SECRET;
  const scope = process.env.ITAU_EXTRATO_SCOPE;

  if (!clientId || !clientSecret) {
    throw new Error(
      "Client ID/Secret do ItaÃº Extrato nao configurados (ITAU_EXTRATO_CLIENT_ID/CLIENT_SECRET)."
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
    agent: createItauExtratoAgent(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(tokenPayload),
      "User-Agent": "FIDCIJJ/1.0",
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(getItauExtratoTokenUrl(), options, (res) => {
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
            `Erro ${res.statusCode} ao obter token ItaÃº Extrato: ${extractErrorMessage(
              res.statusCode,
              data
            )}`
          )
        );
      });
    });

    req.on("error", (err) =>
      reject(new Error(`Erro de rede ao obter token ItaÃº Extrato: ${err.message}`))
    );
    req.write(tokenPayload);
    req.end();
  });
}

export async function consultarExtratoItau(accessToken, params) {
  if (!accessToken) throw new Error("Access token do ItaÃº Extrato nao informado.");

  const statementId = buildStatementId(params);
  const baseEndpoint = `${getItauExtratoEndpoint()}/${statementId}`;
  const pageSize = getItauExtratoPageSize();
  const consolidatedData = [];
  const visitedPages = new Set();
  let currentPage = 1;
  let lastPayload = null;

  for (let requestCount = 0; requestCount < ITAU_EXTRATO_MAX_PAGES; requestCount += 1) {
    if (visitedPages.has(currentPage)) break;
    visitedPages.add(currentPage);

    const query = buildExtratoQuery({ ...params, page: currentPage, pageSize });
    const endpoint = `${baseEndpoint}${query.toString() ? `?${query.toString()}` : ""}`;
    const payload = await requestItauExtratoPage(endpoint, accessToken);
    const pageData = Array.isArray(payload?.data) ? payload.data : [];

    lastPayload = payload;
    consolidatedData.push(...pageData);

    const nextPage = resolveNextExtratoPage({
      payload,
      currentPage,
      pageSize,
      itemCount: pageData.length,
    });

    if (!nextPage || visitedPages.has(nextPage)) break;
    currentPage = nextPage;
  }

  if (!lastPayload || typeof lastPayload !== "object") {
    return { data: consolidatedData };
  }

  return {
    ...lastPayload,
    data: consolidatedData,
  };
}

export const normalizeItauConta = (conta) => {
  const raw = String(conta || "").trim();
  if (!raw) return "";

  if (raw.includes("-")) {
    return onlyDigits(raw.split("-")[0]).padStart(5, "0").slice(-5);
  }

  const digits = onlyDigits(raw);
  if (!digits) return "";

  if (digits.length >= 6) {
    return digits.slice(0, digits.length - 1).padStart(5, "0").slice(-5);
  }

  return digits.padStart(5, "0").slice(-5);
};

export const normalizeItauAgencia = (agencia) => {
  const digits = onlyDigits(agencia);
  if (!digits) return "";
  return digits.length <= 4 ? digits.padStart(4, "0") : digits.slice(0, 4);
};

export const normalizeItauDac = (conta) => {
  const raw = String(conta || "").trim();
  if (!raw) return "";

  if (raw.includes("-")) {
    return onlyDigits(raw.split("-")[1] || "").slice(0, 1);
  }

  const digits = onlyDigits(raw);
  if (digits.length >= 6) return digits.slice(-1);
  return "";
};
