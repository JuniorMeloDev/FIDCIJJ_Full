import https from 'https';

// Função para obter o token de acesso da API do Safra
export async function getSafraAccessToken() {
    const clientId = process.env.SAFRA_CLIENT_ID;
    const username = process.env.SAFRA_USERNAME;
    const password = process.env.SAFRA_PASSWORD;

    if (!clientId || !username || !password) {
        throw new Error('As credenciais do Safra não estão configuradas nas variáveis de ambiente.');
    }

    const tokenEndpoint = 'https://api-hml.safranegocios.com.br/gateway/v1/oauth2/token';
    const postData = new URLSearchParams({
        grant_type: 'password',
        client_id: clientId,
        username: username,
        password: password
    }).toString();

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(tokenEndpoint, options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(jsonData);
                    } else {
                        reject(new Error(`Erro ${res.statusCode}: ${jsonData.message || data}`));
                    }
                } catch (e) {
                    reject(new Error(`Falha ao processar a resposta do token: ${data}`));
                }
            });
        });
        req.on('error', (e) => reject(new Error(`Erro de rede na requisição de token: ${e.message}`)));
        req.write(postData);
        req.end();
    });
}

// Função para registrar um boleto na API do Safra
export async function registrarBoletoSafra(accessToken, dadosBoleto) {
    const apiEndpoint = 'https://api-hml.safranegocios.com.br/gateway/cobrancas/v1/boletos';
    const payload = JSON.stringify(dadosBoleto);

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'Safra-Correlation-ID': crypto.randomUUID()
        },
    };

    return new Promise((resolve, reject) => {
        const req = https.request(apiEndpoint, options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                try {
                    const jsonData = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(jsonData);
                    } else {
                        reject(new Error(`Erro ${res.statusCode} ao registrar boleto: ${jsonData.message || data}`));
                    }
                } catch (e) {
                    reject(new Error(`Falha ao processar a resposta do registro de boleto: ${data}`));
                }
            });
        });
        req.on('error', (e) => reject(new Error(`Erro de rede na requisição de registro: ${e.message}`)));
        req.write(payload);
        req.end();
    });
}