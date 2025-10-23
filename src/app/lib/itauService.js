import https from 'https';
import { randomUUID } from 'crypto'; 

// --- FUNÇÃO AUXILIAR CRIADA (Baseada no seu registrarBoletoItau) ---
const createItauAgent = () => {
    const certificate = process.env.ITAU_CERTIFICATE;
    const privateKey = process.env.ITAU_PRIVATE_KEY;

    if (!certificate || !privateKey) {
        throw new Error('O certificado ou a chave privada do Itaú não foram encontrados nas variáveis de ambiente.');
    }

    return new https.Agent({
        cert: certificate, 
        key: privateKey,   
    });
}

// Função existente (sem alterações)
export async function getItauAccessToken() {
    console.log("\n--- [ITAÚ API] Etapa 1: Obtenção de Token (PRODUÇÃO) ---");
    const clientId = process.env.ITAU_CLIENT_ID;
    const clientSecret = process.env.ITAU_CLIENT_SECRET;
    const certificate = process.env.ITAU_CERTIFICATE;
    const privateKey = process.env.ITAU_PRIVATE_KEY;

    if (!clientId || !clientSecret || !certificate || !privateKey) {
        throw new Error('Credenciais, certificado ou chave privada do Itaú não configurados.');
    }

    const tokenEndpoint = 'https://sts.itau.com.br/api/oauth/token'; 
    const postData = new URLSearchParams({
        'grant_type': 'client_credentials',
        'client_id': clientId,
        'client_secret': clientSecret
    }).toString();

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'FIDCIJJ/1.0'
        },
        cert: certificate,
        key: privateKey,
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

// Função existente (sem alterações)
export async function registrarBoletoItau(accessToken, dadosBoleto) {
    console.log("\n--- [ITAÚ API] Etapa 2: Registro de Boleto (PRODUÇÃO) ---");
    const apiEndpoint = 'https://api.itau.com.br/cash_management/v2/boletos';
    const correlationId = randomUUID(); 
    const flowId = randomUUID(); 

    const payload = JSON.stringify(dadosBoleto);

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'x-itau-apikey': process.env.ITAU_CLIENT_ID,
            'x-itau-correlationID': correlationId,
            'x-itau-flowID': flowId,
            'User-Agent': 'FIDCIJJ/1.0'
        },
        agent: createItauAgent(), 
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


// --- FUNÇÃO DE PIX ATUALIZADA COM MELHORIA NOS LOGS DE ERRO ---
export async function enviarPixItau(accessToken, dadosPix) {
    console.log("\n--- [ITAÚ API] Etapa 3: Envio de PIX SISPAG ---");
    
    const apiEndpoint = 'https://api.itau.com.br/sispag/v1/transferencias';
    const correlationId = randomUUID();
    const flowId = randomUUID();
    
    const payload = JSON.stringify(dadosPix);

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'x-itau-apikey': process.env.ITAU_CLIENT_ID,
            'x-itau-correlationID': correlationId,
            'x-itau-flowID': flowId,
            'Accept': 'application/json' 
        },
        agent: createItauAgent(), 
    };

    console.log(`[LOG ITAÚ] Enviando requisição de PIX para: ${apiEndpoint}`);
    // Log do payload já existe na rota, não precisa duplicar
    // console.log("[LOG ITAÚ] Payload PIX enviado:", payload); 

    return new Promise((resolve, reject) => {
        const req = https.request(apiEndpoint, options, (res) => {
            let data = '';
            res.on('data', (chunk) => (data += chunk));
            res.on('end', () => {
                console.log(`[LOG ITAÚ] Resposta do PIX (Status ${res.statusCode}):`, data);
                try {
                    // Tenta parsear, mas guarda o 'data' original para o erro
                    const jsonData = JSON.parse(data); 
                    
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        if (jsonData.status_pagamento === 'Sucesso' || jsonData.status_pagamento === 'Agendado') {
                            console.log("--- [ITAÚ API] PIX enviado/agendado com sucesso. ---");
                            resolve(jsonData);
                        } else {
                             const motivo = jsonData.motivo_recusa?.[0]?.nome || 'Motivo desconhecido';
                             reject(new Error(`PIX Rejeitado pelo Itaú: ${motivo}`));
                        }
                    } else {
                        // --- MELHORIA NA CAPTURA DO ERRO ---
                        console.error("[ERRO API ITAÚ] Payload do erro:", JSON.stringify(jsonData, null, 2));
                        
                        let detailedError = data; // Fallback para a string bruta
                        if (Array.isArray(jsonData) && jsonData.length > 0 && jsonData[0].campo) {
                            // Se for um array de erros, como o da screenshot
                            detailedError = jsonData.map(e => `Campo "${e.campo}": ${e.erro}`).join(', ');
                        } else if (jsonData.mensagem) {
                            detailedError = jsonData.mensagem;
                        } else if (jsonData.detail) {
                            detailedError = jsonData.detail;
                        }
                        
                        reject(new Error(`Erro ${res.statusCode} ao enviar PIX no Itaú: ${detailedError}`));
                        // --- FIM DA MELHORIA ---
                    }
                } catch (e) {
                    // Se o JSON.parse falhar, rejeita com o 'data' bruto
                    reject(new Error(`Falha ao processar a resposta do PIX Itaú (Status ${res.statusCode}): ${data}`));
                }
            });
        });
        req.on('error', (e) => {
            console.error("[ERRO ITAÚ] Erro na requisição de PIX:", e);
            reject(new Error(`Erro de rede na requisição de PIX no Itaú: ${e.message}`));
        });
        req.write(payload);
        req.end();
    });
}