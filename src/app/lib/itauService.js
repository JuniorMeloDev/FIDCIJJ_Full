import https from 'https';

// Função para obter o token de acesso da API do Itaú
export async function getItauAccessToken() {
    console.log("\n--- [ITAÚ API] Etapa 1: Obtenção de Token ---");
    const clientId = process.env.ITAU_CLIENT_ID;
    const clientSecret = process.env.ITAU_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('As credenciais do Itaú (Client ID/Secret) não estão configuradas nas variáveis de ambiente.');
    }

    const tokenEndpoint = 'https://sandbox.devportal.itau.com.br/api/oauth/jwt'; 
    const postData = new URLSearchParams({
        'grant_type': 'client_credentials',
        'client_id': clientId,
        'client_secret': clientSecret
    }).toString();

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            // CORREÇÃO APLICADA: Adicionado o cabeçalho User-Agent para evitar o bloqueio do firewall
            'User-Agent': 'FIDCIJJ/1.0'
        }
    };

    console.log("[LOG ITAÚ] Enviando requisição de token para:", tokenEndpoint);

    return new Promise((resolve, reject) => {
        const req = https.request(tokenEndpoint, options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                console.log(`[LOG ITAÚ] Resposta da requisição de token (Status ${res.statusCode}):`, data);
                try {
                    const jsonData = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        console.log("--- [ITAÚ API] Token obtido com sucesso. ---");
                        resolve(jsonData);
                    } else {
                        reject(new Error(`Erro ${res.statusCode}: ${jsonData.message || data}`));
                    }
                } catch (e) {
                    reject(new Error(`Falha ao processar a resposta do token: ${data}`));
                }
            });
        });
        req.on('error', (e) => {
            console.error("[ERRO ITAÚ] Erro na requisição de token:", e);
            reject(new Error(`Erro de rede na requisição de token: ${e.message}`));
        });
        req.write(postData);
        req.end();
    });
}


// Função para registrar um boleto na API do Itaú
export async function registrarBoletoItau(accessToken, dadosBoleto) {
    console.log("\n--- [ITAÚ API] Etapa 2: Registro de Boleto ---");
    const apiEndpoint = 'https://sandbox.devportal.itau.com.br/itau-ep9-api-boleto-v1-externo/v0/boletos';
    const correlationId = crypto.randomUUID();
    const flowId = crypto.randomUUID(); 

    const payload = JSON.stringify(dadosBoleto);

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'x-itau-apikey': process.env.ITAU_CLIENT_ID,
            'x-itau-correlationID': correlationId,
            'x-itau-flowID': flowId,
            // CORREÇÃO APLICADA: Adicionado o cabeçalho User-Agent também nesta requisição por segurança
            'User-Agent': 'FIDCIJJ/1.0'
        },
    };

    console.log(`[LOG ITAÚ] Enviando requisição de registro para: ${apiEndpoint}`);
    console.log("[LOG ITAÚ] Payload enviado:", payload);
    
    return new Promise((resolve, reject) => {
        const req = https.request(apiEndpoint, options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                console.log(`[LOG ITAÚ] Resposta do registro (Status ${res.statusCode}):`, data);
                try {
                    const jsonData = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        console.log("--- [ITAÚ API] Boleto registrado com sucesso. ---");
                        resolve(jsonData);
                    } else {
                        const errorMessage = jsonData.campos?.[0]?.mensagem || jsonData.mensagem || data;
                        reject(new Error(`Erro ${res.statusCode} ao registrar boleto no Itaú: ${errorMessage}`));
                    }
                } catch (e) {
                    reject(new Error(`Falha ao processar a resposta do registro de boleto do Itaú: ${data}`));
                }
            });
        });
        req.on('error', (e) => {
            console.error("[ERRO ITAÚ] Erro na requisição de registro:", e);
            reject(new Error(`Erro de rede na requisição de registro no Itaú: ${e.message}`));
        });
        req.write(payload);
        req.end();
    });
}