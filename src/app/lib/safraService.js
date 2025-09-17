import https from 'https';

// Função para obter o token de acesso da API do Safra
export async function getSafraAccessToken() {
    console.log("\n--- [SAFRAPAY API] Etapa 1: Obtenção de Token ---");
    const clientId = process.env.SAFRA_CLIENT_ID;
    const username = process.env.SAFRA_USERNAME;
    const password = process.env.SAFRA_PASSWORD;

    if (!clientId || !username || !password) {
        throw new Error('As credenciais do Safra não estão configuradas nas variáveis de ambiente.');
    }

    const tokenEndpoint = 'https://api-hml.safranegocios.com.br/gateway/v1/oauth2/token';
    const postData = new URLSearchParams({
        'grant_type': 'password',
        'client_id': clientId,
        'username': username,
        'password': password
    }).toString();

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        }
    };

    console.log("[LOG SAFRA] Enviando requisição de token para:", tokenEndpoint);

    return new Promise((resolve, reject) => {
        const req = https.request(tokenEndpoint, options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                console.log(`[LOG SAFRA] Resposta da requisição de token (Status ${res.statusCode}):`, data);
                try {
                    const jsonData = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        console.log("--- [SAFRAPAY API] Token obtido com sucesso. ---");
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
            console.error("[ERRO SAFRA] Erro na requisição de token:", e);
            reject(new Error(`Erro de rede na requisição de token: ${e.message}`));
        });
        req.write(postData);
        req.end();
    });
}

// Função para registrar um boleto na API do Safra
export async function registrarBoletoSafra(accessToken, dadosBoleto) {
    console.log("\n--- [SAFRAPAY API] Etapa 2: Registro de Boleto ---");
    const apiEndpoint = 'https://api-hml.safranegocios.com.br/gateway/cobrancas/v1/boletos';
    const correlationId = crypto.randomUUID();
    const payload = JSON.stringify(dadosBoleto);

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'Safra-Correlation-ID': correlationId
        },
    };

    console.log(`[LOG SAFRA] Enviando requisição de registro para: ${apiEndpoint} (Correlation-ID: ${correlationId})`);
    console.log("[LOG SAFRA] Payload enviado:", payload);

    return new Promise((resolve, reject) => {
        const req = https.request(apiEndpoint, options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                console.log(`[LOG SAFRA] Resposta do registro (Status ${res.statusCode}):`, data);
                try {
                    const jsonData = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        console.log("--- [SAFRAPAY API] Boleto registrado com sucesso. ---");
                        resolve(jsonData);
                    } else {
                        // Extrai a mensagem de erro específica do Safra, se disponível
                        const errorMessage = jsonData.fields?.[0]?.message || jsonData.message || data;
                        reject(new Error(`Erro ${res.statusCode} ao registrar boleto: ${errorMessage}`));
                    }
                } catch (e) {
                    reject(new Error(`Falha ao processar a resposta do registro de boleto: ${data}`));
                }
            });
        });
        req.on('error', (e) => {
            console.error("[ERRO SAFRA] Erro na requisição de registro:", e);
            reject(new Error(`Erro de rede na requisição de registro: ${e.message}`));
        });
        req.write(payload);
        req.end();
    });
}

// ... (funções getSafraAccessToken e registrarBoletoSafra permanecem as mesmas no início do arquivo) ...

// ADICIONE ESTA NOVA FUNÇÃO NO FINAL DO ARQUIVO
export async function consultarBoletoSafra(accessToken, params) {
    console.log("\n--- [SAFRAPAY API] Etapa 2.1: Consulta de Boleto Existente ---");
    
    const { agencia, conta, nossoNumero, numeroCliente } = params;
    const queryString = new URLSearchParams({ agencia, conta, numero: nossoNumero, numeroCliente }).toString();
    const apiEndpoint = `https://api-hml.safranegocios.com.br/gateway/cobrancas/v1/boletos?${queryString}`;
    const correlationId = crypto.randomUUID();

    const options = {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Safra-Correlation-ID': correlationId
        },
    };

    console.log(`[LOG SAFRA] Enviando requisição de consulta para: ${apiEndpoint}`);

    return new Promise((resolve, reject) => {
        const req = https.request(apiEndpoint, options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                console.log(`[LOG SAFRA] Resposta da consulta (Status ${res.statusCode}):`, data);
                try {
                    const jsonData = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        console.log("--- [SAFRAPAY API] Boleto consultado com sucesso. ---");
                        resolve(jsonData);
                    } else {
                        reject(new Error(`Erro ${res.statusCode} ao consultar boleto: ${jsonData.message || data}`));
                    }
                } catch (e) {
                    reject(new Error(`Falha ao processar a resposta da consulta: ${data}`));
                }
            });
        });
        req.on('error', (e) => {
            console.error("[ERRO SAFRA] Erro na requisição de consulta:", e);
            reject(new Error(`Erro de rede na requisição de consulta: ${e.message}`));
        });
        req.end();
    });
}