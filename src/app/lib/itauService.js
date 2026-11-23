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


const sispagEndpoint = 'https://api.itau.com.br/sispag/v1';

function requisitarSispag(accessToken, caminho, metodo, dados) {
    const payload = dados === undefined ? undefined : JSON.stringify(dados);
    const options = {
        method: metodo,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'x-itau-apikey': process.env.ITAU_CLIENT_ID,
            'x-itau-correlationID': randomUUID(),
            'x-itau-flowID': randomUUID(),
            'Accept': 'application/json',
        },
        agent: createItauAgent(),
        timeout: 8000,
    };

    return new Promise((resolve, reject) => {
        const req = https.request(`${sispagEndpoint}${caminho}`, options, (res) => {
            let resposta = '';
            res.on('data', (chunk) => (resposta += chunk));
            res.on('end', () => {
                let dadosResposta;
                try {
                    dadosResposta = JSON.parse(resposta);
                } catch {
                    dadosResposta = null;
                }
                resolve({ statusHttp: res.statusCode, dados: dadosResposta });
            });
            res.on('error', reject);
            res.on('aborted', () => reject(new Error('Resposta SISPAG interrompida.')));
        });
        req.on('timeout', () => req.destroy(new Error('Tempo limite na API SISPAG.')));
        req.on('error', reject);
        req.end(payload);
    });
}

function normalizarStatusPix(status) {
    return String(status ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
}

const statusPixAceitos = new Set(['sucesso', 'agendado', 'efetuado', 'efetivado']);
const statusPixRecusados = new Set(['recusado', 'rejeitado', 'nao efetuado', 'cancelado', 'rejeitado em arquivo']);

function motivoRecusaPix(dados) {
    return dados?.motivo_recusa?.[0]?.nome ||
        dados?.motivo_rejeicao?.[0]?.descricao_motivo;
}

function pixSemConfirmacao(codigo) {
    const referencia = codigo ? ` (código ${codigo})` : '';
    return new Error(`O Itaú ainda não confirmou o resultado do PIX${referencia}. Confira o pagamento no SISPAG antes de tentar novamente.`);
}

export async function enviarPixItau(accessToken, dadosPix) {
    const resposta = await requisitarSispag(accessToken, '/transferencias', 'POST', dadosPix)
        .catch((error) => {
            console.warn('[ITAÚ PIX] Falha ao receber o retorno do envio:', error.code);
            throw pixSemConfirmacao();
        });
    const dados = resposta.dados?.data ?? resposta.dados;
    const codigo = dados?.cod_pagamento || dados?.id_pagamento;
    let statusOriginal = dados?.status_pagamento || dados?.status;
    let status = normalizarStatusPix(statusOriginal);
    const motivo = motivoRecusaPix(dados);

    if (resposta.statusHttp >= 500 || resposta.statusHttp === 408 || resposta.statusHttp === 409) {
        throw pixSemConfirmacao(codigo);
    }
    if (resposta.statusHttp < 200 || resposta.statusHttp >= 300) {
        const detalhes = Array.isArray(dados)
            ? dados.map((item) => item.erro || item.mensagem).filter(Boolean).join(', ')
            : dados?.campos?.[0]?.mensagem || dados?.mensagem || dados?.detail;
        throw new Error(`Erro ${resposta.statusHttp} ao enviar PIX no Itaú: ${motivo || detalhes || 'consulte o retorno do banco'}`);
    }

    if (statusPixAceitos.has(status) && !motivo) {
        return { ...dados, cod_pagamento: codigo };
    }
    if (statusPixRecusados.has(status) || motivo) {
        throw new Error(`PIX rejeitado pelo Itaú: ${motivo || statusOriginal}`);
    }

    // A inclusão pode ser confirmada antes da efetivação. Consulte o mesmo
    // pagamento pelo identificador do banco, sem repetir o POST.
    if (codigo) {
        for (let tentativa = 0; tentativa < 3; tentativa++) {
            if (tentativa > 0) await new Promise((resolve) => setTimeout(resolve, 750));
            const consulta = await requisitarSispag(
                accessToken, `/pagamentos_sispag/${encodeURIComponent(codigo)}`, 'GET'
            ).catch((error) => {
                console.warn('[ITAÚ PIX] Falha ao consultar pagamento:', error.code);
                return null;
            });
            if (consulta?.statusHttp === 404) continue;
            const pagamento = consulta?.dados?.data?.dados_pagamento;
            if (consulta?.statusHttp !== 200 || pagamento?.id_pagamento !== codigo) break;

            statusOriginal = pagamento.status;
            status = normalizarStatusPix(statusOriginal);

            if (statusPixAceitos.has(status)) {
                return { ...dados, cod_pagamento: codigo, status_pagamento: statusOriginal };
            }
            if (statusPixRecusados.has(status)) {
                throw new Error(`PIX rejeitado pelo Itaú: ${motivoRecusaPix(pagamento) || statusOriginal}`);
            }
        }
    }

    console.warn('[ITAÚ PIX] Pagamento sem confirmação:', { codigo, status: statusOriginal });
    throw pixSemConfirmacao(codigo);
}
