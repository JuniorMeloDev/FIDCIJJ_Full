// Substitua todo o conteúdo de: src/app/lib/bradescoService.js
import https from 'https';

// ... (A função getBradescoAccessToken permanece exatamente igual) ...
export async function getBradescoAccessToken() {
  const clientId = process.env.BRADESCO_CLIENT_ID;
  const clientSecret = process.env.BRADESCO_CLIENT_SECRET;
  const certificate = process.env.BRADESCO_PUBLIC_CERT;
  const privateKey = process.env.BRADESCO_PRIVATE_KEY;

  if (!clientId || !clientSecret || !certificate || !privateKey) {
    throw new Error('Variáveis de ambiente do Bradesco não configuradas corretamente.');
  }

  const agent = new https.Agent({
    cert: certificate,
    key: privateKey,
  });

  const tokenEndpoint = 'https://openapisandbox.prebanco.com.br/auth/server/oauth/token';
  const postData = new URLSearchParams({
    'grant_type': 'client_credentials'
  }).toString();

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    agent: agent
  };

  return new Promise((resolve, reject) => {
    const req = https.request(tokenEndpoint, options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(jsonData);
          } else {
            const errorMessage = jsonData.error_description || jsonData.error || `Erro ${res.statusCode}: ${data}`;
            reject(new Error(errorMessage));
          }
        } catch (e) {
          reject(new Error(`Falha ao processar resposta do servidor: ${data}`));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Erro na requisição: ${e.message}`));
    });

    req.write(postData);
    req.end();
  });
}


// ... (A função validarBoletoBradesco pode ser mantida ou removida se não a for usar) ...


/**
 * Registra um novo boleto na API de Cobrança do Bradesco.
 * @param {string} accessToken - O token de acesso obtido previamente.
 * @param {object} dadosBoletoPayload - O payload completo vindo da nossa API /dados-boleto.
 * @returns {Promise<object>} Uma promessa que resolve com a resposta do registro do boleto.
 */
export async function registrarBoleto(accessToken, dadosBoletoPayload) {
  const certificate = process.env.BRADESCO_PUBLIC_CERT;
  const privateKey = process.env.BRADESCO_PRIVATE_KEY;

  if (!certificate || !privateKey) {
    throw new Error('Variáveis de ambiente dos certificados não encontradas.');
  }

  const agent = new https.Agent({
    cert: certificate,
    key: privateKey,
  });

  const apiEndpoint = 'https://openapisandbox.prebanco.com.br/boleto/cobranca-registro/v1/cobranca';
  
  // --- CORREÇÃO PRINCIPAL AQUI ---
  // Reconstruímos o payload para garantir que a estrutura enviada ao Bradesco
  // seja exatamente a que funcionou no Postman.
  const payloadFinal = JSON.stringify({
    "nuCPFCNPJ": dadosBoletoPayload.nuCPFCNPJ,
    "filialCPFCNPJ": dadosBoletoPayload.filialCPFCNPJ,
    "ctrlCPFCNPJ": dadosBoletoPayload.ctrlCPFCNPJ,
    "codigoUsuarioSolicitante": dadosBoletoPayload.codigoUsuarioSolicitante,
    "registraTitulo": dadosBoletoPayload.registraTitulo
  });
  console.log("Payload final a ser enviado para o Bradesco:", payloadFinal);

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'Content-Length': Buffer.byteLength(payloadFinal)
    },
    agent: agent
  };

  return new Promise((resolve, reject) => {
    const req = https.request(apiEndpoint, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
                console.log(`Resposta Bradesco (Status ${res.statusCode}):`, data);

        try {
          const jsonData = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(jsonData);
          } else {
            const errorDetails = jsonData.erros ? JSON.stringify(jsonData.erros) : data;
            reject(new Error(`Erro ${res.statusCode}: ${errorDetails}`));
          }
        } catch (e) {
          reject(new Error(`Falha ao processar resposta do Bradesco: ${data}`));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`Erro na requisição: ${e.message}`)));
    req.write(payloadFinal);
    req.end();
  });
}