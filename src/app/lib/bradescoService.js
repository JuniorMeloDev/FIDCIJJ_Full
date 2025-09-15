// src/app/lib/bradescoService.js
import https from 'https';

/**
 * Obtém o Token de Acesso da API do Bradesco usando mTLS + OAuth.
 * Lê as credenciais e certificados das variáveis de ambiente.
 * @returns {Promise<object>} Uma promessa que resolve com os dados do token.
 */
export async function getBradescoAccessToken() {
  const clientId = process.env.BRADESCO_CLIENT_ID;
  const clientSecret = process.env.BRADESCO_CLIENT_SECRET;
  const certificate = process.env.BRADESCO_PUBLIC_CERT;
  const privateKey = process.env.BRADESCO_PRIVATE_KEY;

  if (!clientId || !clientSecret || !certificate || !privateKey) {
    throw new Error('Variáveis de ambiente do Bradesco não configuradas corretamente.');
  }

  // Cria um Agente HTTPS com os certificados para autenticação mTLS
  const agent = new https.Agent({
    cert: certificate,
    key: privateKey,
  });

  // Prepara os dados para a requisição do token
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
    agent: agent // Essencial para a autenticação mTLS
  };

  // Faz a requisição usando o módulo https nativo do Node.js
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

/**
 * Valida os dados de um boleto Bradesco no ambiente Sandbox.
 * @param {string} accessToken - O token de acesso obtido previamente.
 * @param {string} linhaDigitavel - A linha digitável do boleto a ser validado.
 * @returns {Promise<object>} Uma promessa que resolve com os dados da validação do boleto.
 */
export async function validarBoletoBradesco(accessToken, linhaDigitavel) {
  const certificate = process.env.BRADESCO_PUBLIC_CERT;
  const privateKey = process.env.BRADESCO_PRIVATE_KEY;

  if (!certificate || !privateKey) {
    throw new Error('Variáveis de ambiente dos certificados não encontradas.');
  }

  const agent = new https.Agent({
    cert: certificate,
    key: privateKey,
  });

  const apiEndpoint = 'https://openapisandbox.prebanco.com.br/boleto/cobranca-pagamento/v1/validar-dados-titulo';
  const postData = JSON.stringify({
    "agencia": "2856", // Exemplo do guia
    "tipoEntrada": "1",
    "dadosEntrada": linhaDigitavel
  });

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`, // Token é usado aqui!
      'Content-Length': Buffer.byteLength(postData)
    },
    agent: agent // mTLS ainda é necessário
  };

  return new Promise((resolve, reject) => {
    const req = https.request(apiEndpoint, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(jsonData);
          } else {
            reject(new Error(jsonData.erros?.[0]?.mensagem || `Erro ${res.statusCode}: ${data}`));
          }
        } catch (e) {
          reject(new Error(`Falha ao processar resposta: ${data}`));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`Erro na requisição: ${e.message}`)));
    req.write(postData);
    req.end();
  });
}

/**
 * Registra um novo boleto na API de Cobrança do Bradesco.
 * @param {string} accessToken - O token de acesso obtido previamente.
 * @param {object} dadosBoleto - Um objeto contendo todos os dados necessários para o registro do boleto.
 * @returns {Promise<object>} Uma promessa que resolve com a resposta do registro do boleto.
 */
export async function registrarBoleto(accessToken, dadosBoleto) {
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
  const payload = JSON.stringify(dadosBoleto);

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'Content-Length': Buffer.byteLength(payload)
    },
    agent: agent
  };

  return new Promise((resolve, reject) => {
    const req = https.request(apiEndpoint, options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          const jsonData = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(jsonData);
          } else {
            const errorMessage = jsonData.erros?.[0]?.mensagem || `Erro ${res.statusCode}: ${data}`;
            reject(new Error(errorMessage));
          }
        } catch (e) {
          reject(new Error(`Falha ao processar resposta do Bradesco: ${data}`));
        }
      });
    });

    req.on('error', (e) => reject(new Error(`Erro na requisição: ${e.message}`)));
    req.write(payload);
    req.end();
  });
}