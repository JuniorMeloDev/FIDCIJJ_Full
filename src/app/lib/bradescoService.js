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

  // 2. Cria um Agente HTTPS com os certificados para autenticação mTLS
  const agent = new https.Agent({
    cert: certificate,
    key: privateKey,
  });

  // 3. Prepara os dados para a requisição do token
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

  // 4. Faz a requisição usando o módulo https nativo do Node.js
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
            // Tenta fornecer uma mensagem de erro mais clara do Bradesco
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