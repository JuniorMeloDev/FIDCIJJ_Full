// Substitua todo o conteúdo de: src/app/lib/bradescoService.js
import https from 'https';

const createBradescoAgent = () => {
    const certificate = process.env.BRADESCO_PUBLIC_CERT;
    const privateKey = process.env.BRADESCO_PRIVATE_KEY;

    if (!certificate || !privateKey) {
        console.error("[BRADESCO_SERVICE_ERROR] Certificado público ou chave privada não encontrados.");
        throw new Error('Certificados do Bradesco não configurados corretamente.');
    }

    return new https.Agent({
        cert: Buffer.from(certificate, 'utf-8'),
        key: Buffer.from(privateKey, 'utf-8'),
        rejectUnauthorized: false
    });
};

export async function getBradescoAccessToken() {
    console.log("\n--- [1. INICIANDO REQUISIÇÃO DE TOKEN] ---");
    const clientId = process.env.BRADESCO_CLIENT_ID;
    const clientSecret = process.env.BRADESCO_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('Client ID ou Client Secret do Bradesco não configurados.');
    }

    const agent = createBradescoAgent();
    const tokenEndpoint = 'https://openapisandbox.prebanco.com.br/auth/server/oauth/token';
    const postData = new URLSearchParams({ 'grant_type': 'client_credentials' }).toString();

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`,
        },
        agent: agent
    };

    console.log("[DEBUG] Opções da Requisição de Token:", JSON.stringify({ ...options, agent: 'HTTPS Agent Configured' }, null, 2));

    return new Promise((resolve, reject) => {
        const req = https.request(tokenEndpoint, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                console.log(`[DEBUG] Resposta do Token (Status ${res.statusCode}):`, data);
                console.log("--- [1. FIM DA REQUISIÇÃO DE TOKEN] ---\n");
                try {
                    const jsonData = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(jsonData);
                    } else {
                        reject(new Error(`Erro ${res.statusCode}: ${data}`));
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

export async function registrarBoleto(accessToken, dadosBoletoPayload) {
    console.log("\n--- [2. INICIANDO REGISTRO DE BOLETO] ---");
    const agent = createBradescoAgent();
    const apiEndpoint = 'https://openapisandbox.prebanco.com.br/boleto/cobranca-registro/v1/cobranca';
    const payloadFinal = JSON.stringify(dadosBoletoPayload);

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'Content-Length': Buffer.byteLength(payloadFinal)
        },
        agent: agent
    };

    console.log("[DEBUG] Payload Final para Registro:", payloadFinal);
    console.log("[DEBUG] Opções da Requisição de Registro:", JSON.stringify({ ...options, agent: 'HTTPS Agent Configured' }, null, 2));

    return new Promise((resolve, reject) => {
        const req = https.request(apiEndpoint, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                console.log(`[DEBUG] Resposta do Registro de Boleto (Status ${res.statusCode}):`, data);
                console.log("--- [2. FIM DO REGISTRO DE BOLETO] ---\n");
                try {
                    const jsonData = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(jsonData);
                    } else {
                        reject(new Error(`Erro ${res.statusCode}: ${data}`));
                    }
                } catch (e) {
                    reject(new Error(`Falha ao processar resposta do Bradesco no registro: ${data}`));
                }
            });
        });
        req.on('error', (e) => reject(new Error(`Erro de rede na requisição de registro: ${e.message}`)));
        req.write(payloadFinal);
        req.end();
    });
}