import https from "https";

const getBradescoBaseUrl = () =>
  (process.env.BRADESCO_BASE_URL || "https://openapi.bradesco.com.br").replace(/\/$/, "");

const getBradescoApiBaseUrlFromEnv = () =>
  (process.env.BRADESCO_API_BASE_URL || getBradescoBaseUrl()).replace(/\/$/, "");

const getBradescoTokenEndpoints = () => {
  const explicitUrl = process.env.BRADESCO_TOKEN_URL?.trim();
  if (explicitUrl) return [explicitUrl];

  const baseUrl = getBradescoBaseUrl();
  return [`${baseUrl}/auth/server-mtls/v2/token`];
};

const isBradescoDebugEnabled = () => String(process.env.BRADESCO_DEBUG || "false").toLowerCase() === "true";

const normalizePemFromEnv = (value) =>
  String(value || "")
    .replace(/\\n/g, "\n")
    .replace(/\r/g, "")
    .trim();

const createBradescoAgent = () => {
  const certificateRaw = process.env.BRADESCO_PUBLIC_CERT || process.env.BRADESCO_CERTIFICATE;
  const privateKeyRaw = process.env.BRADESCO_PRIVATE_KEY;
  const certificate = normalizePemFromEnv(certificateRaw);
  const privateKey = normalizePemFromEnv(privateKeyRaw);

  if (!certificate || !privateKey) {
    throw new Error("Certificado/chave do Bradesco nao configurados.");
  }

  const agentOptions = {
    cert: certificate,
    key: privateKey,
  };

  if (process.env.BRADESCO_PRIVATE_KEY_PASSPHRASE) {
    agentOptions.passphrase = process.env.BRADESCO_PRIVATE_KEY_PASSPHRASE;
  }

  return new https.Agent(agentOptions);
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
  const clientId = process.env.BRADESCO_BOLETO_CLIENT_ID || process.env.BRADESCO_CLIENT_ID;
  const clientSecret =
    process.env.BRADESCO_BOLETO_CLIENT_SECRET || process.env.BRADESCO_CLIENT_SECRET;
  const scope = process.env.BRADESCO_BOLETO_SCOPE || process.env.BRADESCO_SCOPE;

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

  const runTokenRequest = (tokenEndpoint) => {
    const tokenParams = new URLSearchParams(baseParams);
    tokenParams.set("client_id", clientId);
    tokenParams.set("client_secret", clientSecret);
    const payload = tokenParams.toString();
    const options = {
      ...baseOptions,
      headers: {
        ...baseOptions.headers,
        "Content-Length": Buffer.byteLength(payload),
      },
    };

    if (isBradescoDebugEnabled()) {
      console.warn("[BRADESCO TOKEN DEBUG] Tentando endpoint:", tokenEndpoint);
      console.warn("[BRADESCO TOKEN DEBUG] Modo auth: body_client_credentials");
      console.warn(
        "[BRADESCO TOKEN DEBUG] Payload keys:",
        Object.fromEntries([...tokenParams.keys()].map((k) => [k, k === "client_secret" ? "***" : tokenParams.get(k)]))
      );
    }

    return new Promise((resolve, reject) => {
      const req = https.request(tokenEndpoint, options, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          const jsonData = parseJsonSafe(data);
          if (isBradescoDebugEnabled()) {
            console.warn("[BRADESCO TOKEN DEBUG] Status:", res.statusCode);
            console.warn("[BRADESCO TOKEN DEBUG] Response headers:", JSON.stringify(res.headers));
            console.warn("[BRADESCO TOKEN DEBUG] Response body (first 500):", String(data).slice(0, 500));
          }
          if (res.statusCode >= 200 && res.statusCode < 300 && jsonData?.access_token) {
            resolve(jsonData);
            return;
          }
          reject(
            new Error(
              `Erro ${res.statusCode} ao obter token Bradesco (endpoint=${tokenEndpoint}, auth=body): ${extractApiError(
                jsonData,
                data
              )}`
            )
          );
        });
      });

      req.on("error", (err) => {
        if (isBradescoDebugEnabled()) {
          console.warn("[BRADESCO TOKEN DEBUG] Erro de rede:", err.message);
        }
        reject(new Error(`Erro de rede ao obter token Bradesco: ${err.message}`));
      });
      req.write(payload);
      req.end();
    });
  };

  const endpoints = getBradescoTokenEndpoints();
  let lastError = null;
  for (const endpoint of endpoints) {
    try {
      return await runTokenRequest(endpoint);
    } catch (error) {
      if (isBradescoDebugEnabled()) {
        console.warn("[BRADESCO TOKEN DEBUG] Tentativa falhou:", error.message);
      }
      lastError = error;
    }
  }

  const baseHint =
    "Falha no token mTLS Bradesco. Valide se o certificado publico cadastrado na credencial de producao corresponde a chave privada usada no app e se a credencial está Ativa.";
  if (!lastError) {
    throw new Error(baseHint);
  }
  throw new Error(`${baseHint} Detalhe: ${lastError.message}`);
}

export async function registrarBoleto(accessToken, dadosBoletoPayload) {
  if (!accessToken) {
    throw new Error("Access token do Bradesco nao informado.");
  }

  const apiBaseUrl = getBradescoApiBaseUrlFromEnv();
  const apiEndpoint = `${apiBaseUrl}/boleto/cobranca-registro/v1/cobranca`;

  const baseOptions = {
    method: "POST",
    agent: createBradescoAgent(),
  };

  const authClientId = process.env.BRADESCO_BOLETO_CLIENT_ID || process.env.BRADESCO_CLIENT_ID;
  const authClientSecret =
    process.env.BRADESCO_BOLETO_CLIENT_SECRET || process.env.BRADESCO_CLIENT_SECRET;

  const authAttempts = [
    // Mais próximo do padrão mTLS em produção.
    { mode: "bearer_no_ibm", authorization: `Bearer ${accessToken}`, includeIbmHeaders: false },
    // Alguns gateways aceitam token sem prefixo Bearer.
    { mode: "raw_no_ibm", authorization: accessToken, includeIbmHeaders: false },
    // Fallbacks com headers IBM.
    { mode: "bearer_with_ibm", authorization: `Bearer ${accessToken}`, includeIbmHeaders: true },
    { mode: "raw_with_ibm", authorization: accessToken, includeIbmHeaders: true },
  ];

  const sendRequest = (payloadObj, authAttempt) => {
    const localPayload = JSON.stringify(payloadObj);
    const localHeaders = {
      "Content-Type": "application/json",
      Accept: "application/json",
      Authorization: authAttempt.authorization,
      "Content-Length": Buffer.byteLength(localPayload),
    };
    if (authAttempt.includeIbmHeaders) {
      localHeaders["X-IBM-Client-Id"] = authClientId;
      if (authClientSecret) {
        localHeaders["X-IBM-Client-Secret"] = authClientSecret;
      }
    }

    const localOptions = {
      ...baseOptions,
      headers: localHeaders,
    };

    return new Promise((resolve, reject) => {
      const req = https.request(apiEndpoint, localOptions, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          const jsonData = parseJsonSafe(data);
          if (isBradescoDebugEnabled()) {
            console.warn("[BRADESCO BOLETO DEBUG] Endpoint:", apiEndpoint);
            console.warn("[BRADESCO BOLETO DEBUG] Auth mode:", authAttempt.mode);
            console.warn("[BRADESCO BOLETO DEBUG] Status:", res.statusCode);
            console.warn("[BRADESCO BOLETO DEBUG] Response body (first 500):", String(data).slice(0, 500));
          }
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

  let firstAttempt = null;
  let lastAttempt = null;
  for (const authAttempt of authAttempts) {
    const attemptResult = await sendRequest(dadosBoletoPayload, authAttempt);
    lastAttempt = attemptResult;
    if (attemptResult.ok) return attemptResult.jsonData;
    if (!firstAttempt) firstAttempt = attemptResult;
    // Se não for erro de autorização/autenticação, não insiste em outros formatos.
    if (![400, 401, 403].includes(attemptResult.res.statusCode)) {
      break;
    }
  }
  if (!firstAttempt) firstAttempt = lastAttempt;
  if (!lastAttempt) lastAttempt = firstAttempt;

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
    const secondAttempt = await sendRequest(retriedPayload, authAttempts[0]);
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
    lastAttempt.res.headers["x-request-id"] ||
    lastAttempt.res.headers["x-correlation-id"] ||
    lastAttempt.res.headers["x-global-transaction-id"] ||
    lastAttempt.jsonData?.details?.msgId ||
    lastAttempt.jsonData?.msgId ||
    "";
  const correlationText = correlationId ? ` (correlationId: ${correlationId})` : "";
  const summaryMessages = extractValidationMessages(lastAttempt.jsonData);
  const compactSummary = summaryMessages.length
    ? `${summaryMessages.slice(0, 8).join(" | ")}${summaryMessages.length > 8 ? " | ..." : ""}`
    : extractApiError(lastAttempt.jsonData, lastAttempt.data);
  throw new Error(
    `Erro ${lastAttempt.res.statusCode} ao registrar boleto Bradesco${correlationText}: ${compactSummary}`
  );
}
