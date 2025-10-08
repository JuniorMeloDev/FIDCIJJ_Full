// src/app/lib/interService.js
import https from 'https';
import { format } from 'date-fns';

/**
 * Cria um agente HTTPS com os certificados mTLS do Inter para autenticação mútua.
 */
const createInterAgent = () => {
    const certificate = process.env.INTER_CERTIFICATE;
    const privateKey = process.env.INTER_PRIVATE_KEY;

    if (!certificate || !privateKey) {
        throw new Error('O certificado (.crt) ou a chave privada (.key) do Inter não foram encontrados nas variáveis de ambiente.');
    }

    return new https.Agent({
        cert: certificate.replace(/\\n/g, '\n'),
        key: privateKey.replace(/\\n/g, '\n'),
    });
};

/**
 * Obtém o token de acesso (access_token) da API de produção do Banco Inter.
 */
export async function getInterAccessToken() {
    console.log("\n--- [INTER API] Etapa 1: Obtenção de Token de PRODUÇÃO ---");
    const clientId = process.env.INTER_CLIENT_ID;
    const clientSecret = process.env.INTER_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
        throw new Error('As credenciais de produção (INTER_CLIENT_ID, INTER_CLIENT_SECRET) do Inter não estão configuradas.');
    }
    const tokenEndpoint = 'https://cdpj.partners.bancointer.com.br/oauth/v2/token';
    const postData = new URLSearchParams({
        'grant_type': 'client_credentials',
        'client_id': clientId,
        'client_secret': clientSecret,
        'scope': 'extrato.read pagamento-pix.write pagamento-pix.read'
    }).toString();
    const options = {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        agent: createInterAgent(),
    };
    console.log("[LOG INTER] Enviando requisição de token para PRODUÇÃO.");
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
                        reject(new Error(`Erro ${res.statusCode} ao obter token: ${jsonData.error_description || data}`));
                    }
                } catch (e) {
                    reject(new Error(`Falha ao processar resposta do token: ${data}`));
                }
            });
        });
        req.on('error', (e) => reject(new Error(`Erro de rede na requisição de token: ${e.message}`)));
        req.write(postData);
        req.end();
    });
}

/**
 * Consulta o saldo da conta corrente na data atual.
 */
export async function consultarSaldoInter(accessToken, contaCorrente) {
    console.log("\n--- [INTER API] Etapa 2: Consulta de Saldo ---");
    
    const hoje = format(new Date(), 'yyyy-MM-dd');
    const apiEndpoint = `https://cdpj.partners.bancointer.com.br/banking/v2/saldo?dataSaldo=${hoje}`;
    
    // Remove o dígito verificador da conta corrente
    const cleanContaCorrente = (contaCorrente || '').split('-')[0];

    const options = {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'x-conta-corrente': cleanContaCorrente
        },
        agent: createInterAgent(),
    };
    
    return new Promise((resolve, reject) => {
        const req = https.request(apiEndpoint, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(JSON.parse(data));
                    } else {
                        reject(new Error(`Erro ${res.statusCode} ao consultar saldo: ${data}`));
                    }
                } catch(e) {
                     reject(new Error(`Falha ao processar resposta do saldo: ${data}`));
                }
            });
        });
        req.on('error', e => reject(new Error(`Erro de rede na consulta de saldo: ${e.message}`)));
        req.end();
    });
}

/**
 * Consulta o extrato da conta em um período.
 */
export async function consultarExtratoInter(accessToken, contaCorrente, dataInicio, dataFim) {
    console.log("\n--- [INTER API] Etapa 3: Consulta de Extrato ---");
    const apiEndpoint = `https://cdpj.partners.bancointer.com.br/banking/v2/extrato?dataInicio=${dataInicio}&dataFim=${dataFim}`;
    
    const cleanContaCorrente = (contaCorrente || '').split('-')[0];

    const options = {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'x-conta-corrente': cleanContaCorrente
        },
        agent: createInterAgent(),
    };
     return new Promise((resolve, reject) => {
        const req = https.request(apiEndpoint, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                     if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(JSON.parse(data));
                    } else {
                        reject(new Error(`Erro ${res.statusCode} ao consultar extrato: ${data}`));
                    }
                } catch(e) {
                     reject(new Error(`Falha ao processar resposta do extrato: ${data}`));
                }
            });
        });
        req.on('error', e => reject(new Error(`Erro de rede na consulta de extrato: ${e.message}`)));
        req.end();
    });
}

/**
 * Envia um pagamento PIX.
 */
export async function enviarPixInter(accessToken, dadosPix, contaCorrente) {
    console.log("\n--- [INTER API] Etapa 4: Envio de PIX ---");
    const apiEndpoint = 'https://cdpj.partners.bancointer.com.br/banking/v2/pix';
    const payload = JSON.stringify(dadosPix);

    const cleanContaCorrente = (contaCorrente || '').split('-')[0];

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'x-conta-corrente': cleanContaCorrente
        },
        agent: createInterAgent(),
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
                        const errorMessage = jsonData.detail || jsonData.title || data;
                        reject(new Error(`Erro ${res.statusCode}: ${errorMessage}`));
                    }
                } catch(e) {
                    reject(new Error(`Falha ao processar resposta do PIX: ${data}`));
                }
            });
        });
        req.on('error', (e) => reject(new Error(`Erro de rede no envio de PIX: ${e.message}`)));
        req.write(payload);
        req.end();
    });
}