import https from "https";

const getBradescoBaseUrl = () =>
  (process.env.BRADESCO_BASE_URL || "https://openapisandbox.prebanco.com.br").replace(/\/$/, "");

const getBradescoApiBaseUrlFromEnv = () =>
  (process.env.BRADESCO_API_BASE_URL || getBradescoBaseUrl()).replace(/\/$/, "");

const getBradescoTokenEndpoints = () => {
  const explicitUrl = process.env.BRADESCO_TOKEN_URL?.trim();
  if (explicitUrl) return [explicitUrl];

  const baseUrl = getBradescoBaseUrl();
  return [
    `${baseUrl}/auth/server-mtls/v2/token`,
    `${baseUrl}/auth/server/oauth/token`,
  ];
};

const createBradescoAgent = () => {
  const certificate = process.env.BRADESCO_PUBLIC_CERT || process.env.BRADESCO_CERTIFICATE;
  const privateKey = process.env.BRADESCO_PRIVATE_KEY;

  if (!certificate || !privateKey) {
    throw new Error("Certificado/chave do Bradesco nao configurados.");
  }

  return new https.Agent({
    cert: certificate,
    key: privateKey,
  });
};

const parseJsonSafe = (rawData) => {
  try {
    return JSON.parse(rawData);
  } catch {
    return null;
  }
};

const decodeHtmlEntities = (value = "") =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

const extractXmlFaultMessage = (rawData = "") => {
  if (!rawData || typeof rawData !== "string" || !rawData.includes("<")) return null;
  const textTag = rawData.match(/<env:Text[^>]*>([\s\S]*?)<\/env:Text>/i)?.[1];
  const reasonTag = rawData.match(/<env:Reason[^>]*>([\s\S]*?)<\/env:Reason>/i)?.[1];
  const faultCode = rawData.match(/<env:Subcode[^>]*>[\s\S]*?<env:Value[^>]*>([\s\S]*?)<\/env:Value>/i)?.[1]
    || rawData.match(/<env:Code[^>]*>[\s\S]*?<env:Value[^>]*>([\s\S]*?)<\/env:Value>/i)?.[1];
  const fallback = textTag || reasonTag || rawData;
  const cleaned = decodeHtmlEntities(String(fallback).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim());
  const codeClean = faultCode ? decodeHtmlEntities(faultCode.replace(/<[^>]*>/g, "").trim()) : "";
  if (cleaned) return codeClean ? `${codeClean}: ${cleaned}` : cleaned;
  return null;
};

const extractApiError = (jsonData, rawData) => {
  const xmlFault = extractXmlFaultMessage(rawData);
  if (xmlFault) return xmlFault;

  if (!jsonData) return rawData;

  if (Array.isArray(jsonData.mensagens) && jsonData.mensagens.length > 0) {
    return jsonData.mensagens.map((m) => m?.mensagem || JSON.stringify(m)).join(" | ");
  }

  if (Array.isArray(jsonData.errors) && jsonData.errors.length > 0) {
    return jsonData.errors.map((e) => e?.message || JSON.stringify(e)).join(" | ");
  }

  return jsonData.mensagem || jsonData.message || jsonData.detail || rawData;
};

const extractValidationMessages = (jsonData) => {
  const entries = Array.isArray(jsonData?.errosValidacao)
    ? jsonData.errosValidacao
    : jsonData?.errosValidacao
      ? [jsonData.errosValidacao]
      : [];

  const messages = [];
  for (const item of entries) {
    if (typeof item === "string") {
      messages.push(item);
      continue;
    }
    if (typeof item?.mensagem === "string") messages.push(item.mensagem);
    if (Array.isArray(item?.erros)) {
      for (const err of item.erros) {
        if (typeof err === "string") messages.push(err);
        else if (typeof err?.mensagem === "string") messages.push(err.mensagem);
      }
    }
  }
  return messages;
};

const extractUnknownArguments = (jsonData) => {
  const unknown = new Set();
  for (const text of extractValidationMessages(jsonData)) {
    const normalizedText = text
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
    const match = normalizedText.match(/argumento\s+([a-z0-9_]+)\s+nao\s+existe\s+no\s+arquivo/i);
    if (match?.[1]) unknown.add(match[1]);
  }
  return [...unknown];
};

const removeKeysFromObject = (obj, keysToRemove = []) => {
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) return obj;
  const drop = new Set(keysToRemove.map((k) => String(k).toLowerCase()));
  const next = {};
  for (const [key, value] of Object.entries(obj)) {
    if (!drop.has(String(key).toLowerCase())) next[key] = value;
  }
  return next;
};

export async function getBradescoAccessToken() {
  const clientId = process.env.BRADESCO_CLIENT_ID;
  const clientSecret = process.env.BRADESCO_CLIENT_SECRET;
  const scope = process.env.BRADESCO_SCOPE || "CBON";

  if (!clientId || !clientSecret) {
    throw new Error("Client ID/Secret do Bradesco nao configurados.");
  }

  const baseParams = new URLSearchParams({
    grant_type: "client_credentials",
    ...(scope ? { scope } : {}),
  });

  const baseOptions = {
    method: "POST",
    agent: createBradescoAgent(),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
  };

  const runTokenRequest = (tokenEndpoint, useBasicAuth) => {
    const tokenParams = new URLSearchParams(baseParams);
    if (!useBasicAuth) {
      tokenParams.set("client_id", clientId);
      tokenParams.set("client_secret", clientSecret);
    }
    const payload = tokenParams.toString();
    const options = {
      ...baseOptions,
      headers: {
        ...baseOptions.headers,
        ...(useBasicAuth
          ? { Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}` }
          : {}),
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(tokenEndpoint, options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          const jsonData = parseJsonSafe(data);
          if (res.statusCode >= 200 && res.statusCode < 300 && jsonData?.access_token) {
            resolve(jsonData);
            return;
          }
          reject(new Error(`Erro ${res.statusCode} ao obter token Bradesco: ${extractApiError(jsonData, data)}`));
        });
      });

      req.on("error", (err) => reject(new Error(`Erro de rede ao obter token Bradesco: ${err.message}`)));
      req.write(payload);
      req.end();
    });
  };

  const endpoints = getBradescoTokenEndpoints();
  const attempts = [];
  for (const endpoint of endpoints) {
    attempts.push({ endpoint, useBasicAuth: false });
    attempts.push({ endpoint, useBasicAuth: true });
  }

  let lastError;
  for (const attempt of attempts) {
    try {
      return await runTokenRequest(attempt.endpoint, attempt.useBasicAuth);
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("Falha ao obter token Bradesco.");
}

export async function registrarBoleto(accessToken, dadosBoletoPayload) {
  if (!accessToken) {
    throw new Error("Access token do Bradesco nao informado.");
  }

  const apiBaseUrl = getBradescoApiBaseUrlFromEnv();
  const apiEndpoint = `${apiBaseUrl}/boleto/cobranca-registro/v1/cobranca`;

  const options = {
    method: "POST",
    agent: createBradescoAgent(),
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
      "X-IBM-Client-Id": process.env.BRADESCO_CLIENT_ID,
      ...(process.env.BRADESCO_CLIENT_SECRET
        ? { "X-IBM-Client-Secret": process.env.BRADESCO_CLIENT_SECRET }
        : {}),
    },
  };

  const sendRequest = (payloadObj) => {
    const localPayload = JSON.stringify(payloadObj);
    const localOptions = {
      ...options,
      headers: {
        ...options.headers,
        "Content-Length": Buffer.byteLength(localPayload),
      },
    };

    return new Promise((resolve, reject) => {
      const req = https.request(apiEndpoint, localOptions, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          const jsonData = parseJsonSafe(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve({ ok: true, res, data, jsonData: jsonData ?? { raw: data } });
            return;
          }
          resolve({ ok: false, res, data, jsonData });
        });
      });

      req.on("error", (err) => reject(new Error(`Erro de rede ao registrar boleto Bradesco: ${err.message}`)));
      req.write(localPayload);
      req.end();
    });
  };

  const firstAttempt = await sendRequest(dadosBoletoPayload);
  if (firstAttempt.ok) return firstAttempt.jsonData;

  if (firstAttempt.res.statusCode === 422) {
    const unknownArgsLog = extractUnknownArguments(firstAttempt.jsonData);
    const missingArgsLog = [];
    console.warn("[BRADESCO 422] Campos enviados:", Object.keys(dadosBoletoPayload).sort());
    if (unknownArgsLog.length) {
      console.warn("[BRADESCO 422] Campos nao suportados pelo contrato atual:", unknownArgsLog.sort());
    }
    if (missingArgsLog.length) {
      console.warn("[BRADESCO 422] Campos obrigatorios faltando no contrato atual:", missingArgsLog.sort());
    }
    const validationMessages = extractValidationMessages(firstAttempt.jsonData);
    if (validationMessages.length) {
      console.warn("[BRADESCO 422] Primeiras validacoes:", validationMessages.slice(0, 20));
    }
  }

  // Retry unico: remove apenas campos que o contrato nao reconhece.
  const unknownArgs = firstAttempt.res.statusCode === 422 ? extractUnknownArguments(firstAttempt.jsonData) : [];
  if (unknownArgs.length > 0) {
    const retriedPayload = removeKeysFromObject(dadosBoletoPayload, unknownArgs);
    if (unknownArgs.length) {
      console.warn("[BRADESCO 422] Retry removendo campos nao suportados:", unknownArgs.sort());
    }
    const secondAttempt = await sendRequest(retriedPayload);
    if (secondAttempt.ok) return secondAttempt.jsonData;

    const correlationIdRetry =
      secondAttempt.res.headers["x-request-id"] ||
      secondAttempt.res.headers["x-correlation-id"] ||
      secondAttempt.res.headers["x-global-transaction-id"] ||
      secondAttempt.jsonData?.details?.msgId ||
      secondAttempt.jsonData?.msgId ||
      "";
    const correlationTextRetry = correlationIdRetry ? ` (correlationId: ${correlationIdRetry})` : "";
    const summaryMessages = extractValidationMessages(secondAttempt.jsonData);
    const compactSummary = summaryMessages.length
      ? `${summaryMessages.slice(0, 8).join(" | ")}${summaryMessages.length > 8 ? " | ..." : ""}`
      : extractApiError(secondAttempt.jsonData, secondAttempt.data);
    throw new Error(
      `Erro ${secondAttempt.res.statusCode} ao registrar boleto Bradesco${correlationTextRetry}: ${compactSummary}`
    );
  }

  const correlationId =
    firstAttempt.res.headers["x-request-id"] ||
    firstAttempt.res.headers["x-correlation-id"] ||
    firstAttempt.res.headers["x-global-transaction-id"] ||
    firstAttempt.jsonData?.details?.msgId ||
    firstAttempt.jsonData?.msgId ||
    "";
  const correlationText = correlationId ? ` (correlationId: ${correlationId})` : "";
  const summaryMessages = extractValidationMessages(firstAttempt.jsonData);
  const compactSummary = summaryMessages.length
    ? `${summaryMessages.slice(0, 8).join(" | ")}${summaryMessages.length > 8 ? " | ..." : ""}`
    : extractApiError(firstAttempt.jsonData, firstAttempt.data);
  throw new Error(
    `Erro ${firstAttempt.res.statusCode} ao registrar boleto Bradesco${correlationText}: ${compactSummary}`
  );
}
