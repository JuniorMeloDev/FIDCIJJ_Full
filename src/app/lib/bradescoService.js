import https from 'https';
import fs from 'fs';

/**
 * Obtém o token de acesso
 */
export async function getBradescoAccessToken() {
  const clientId = process.env.BRADESCO_CLIENT_ID;
  const clientSecret = process.env.BRADESCO_CLIENT_SECRET;
  const certPath = process.env.BRADESCO_CERT_PATH;      // caminho do .pem
  const keyPath  = process.env.BRADESCO_KEY_PATH;       // caminho do .key

  if (!clientId || !clientSecret || !certPath || !keyPath) {
    throw new Error('Variáveis de ambiente do Bradesco não configuradas corretamente.');
  }

  const agent = new https.Agent({
    cert: fs.readFileSync(certPath),
    key:  fs.readFileSync(keyPath),
    servername: 'openapisandbox.prebanco.com.br',
    rejectUnauthorized: true
  });

  const tokenEndpoint = 'https://openapisandbox.prebanco.com.br/auth/server/oauth/token';
  const postData = new URLSearchParams({ grant_type: 'client_credentials' }).toString();

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
    },
    agent
  };

  return new Promise((resolve, reject) => {
    const req = https.request(tokenEndpoint, options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(json);
          else reject(new Error(json.error_description || data));
        } catch {
          reject(new Error(`Falha ao processar resposta do servidor: ${data}`));
        }
      });
    });
    req.on('error', e => reject(new Error(`Erro na requisição: ${e.message}`)));
    req.write(postData);
    req.end();
  });
}

/**
 * Registro de boleto
 */
export async function registrarBoleto(accessToken, payload) {
  const certPath = process.env.BRADESCO_CERT_PATH;
  const keyPath  = process.env.BRADESCO_KEY_PATH;

  const agent = new https.Agent({
    cert: fs.readFileSync(certPath),
    key:  fs.readFileSync(keyPath),
    servername: 'openapisandbox.prebanco.com.br',
    rejectUnauthorized: true
  });

  // ✅ Monta o payload final garantindo números
  const body = JSON.stringify({
    nuCPFCNPJ: payload.nuCPFCNPJ,
    filialCPFCNPJ: payload.filialCPFCNPJ,
    ctrlCPFCNPJ: payload.ctrlCPFCNPJ,
    codigoUsuarioSolicitante: payload.codigoUsuarioSolicitante,
    registraTitulo: {
      ...payload.registraTitulo,
      valorNominalTitulo: Number(payload.registraTitulo.valorNominalTitulo),
      percentualJuros: Number(payload.registraTitulo.percentualJuros),
      valorJuros: Number(payload.registraTitulo.valorJuros),
      qtdeDiasJuros: Number(payload.registraTitulo.qtdeDiasJuros),
      percentualMulta: Number(payload.registraTitulo.percentualMulta),
      valorMulta: Number(payload.registraTitulo.valorMulta),
      qtdeDiasMulta: Number(payload.registraTitulo.qtdeDiasMulta)
    }
  });

  console.log('Payload final enviado ao Bradesco:', body);

  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
      'Content-Length': Buffer.byteLength(body)
    },
    agent
  };

  const apiEndpoint = 'https://openapisandbox.prebanco.com.br/boleto/cobranca-registro/v1/cobranca';

  return new Promise((resolve, reject) => {
    const req = https.request(apiEndpoint, options, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        console.log(`Resposta Bradesco (Status ${res.statusCode}):`, data);
        try {
          const json = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) resolve(json);
          else reject(new Error(`Erro ${res.statusCode}: ${data}`));
        } catch {
          reject(new Error(`Falha ao processar resposta do Bradesco: ${data}`));
        }
      });
    });
    req.on('error', e => reject(new Error(`Erro na requisição: ${e.message}`)));
    req.write(body);
    req.end();
  });
}
