// Substitua todo o conteúdo de: src/app/lib/bradescoService.js
import https from 'https';

// Função para criar o agente HTTPS com os certificados
const createBradescoAgent = () => {
    const certificate = process.env.BRADESCO_PUBLIC_CERT;
    const privateKey = process.env.BRADESCO_PRIVATE_KEY;

    if (!certificate || !privateKey) {
        console.error("ERRO: Certificado público ou chave privada não encontrados nas variáveis de ambiente.");
        throw new Error('Certificados do Bradesco não configurados corretamente.');
    }

    console.log("Certificados encontrados. Criando agente HTTPS...");

    return new https.Agent({
        cert: Buffer.from(certificate, 'utf-8'),
        key: Buffer.from(privateKey, 'utf-8'),
        rejectUnauthorized: false // Adicionado para ambientes de sandbox, pode ser necessário
    });
};

// Função para obter o Token de Acesso
export async function getBradescoAccessToken() {
    const clientId = process.env.BRADESCO_CLIENT_ID;
    const clientSecret = process.env.BRADESCO_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
        throw new Error('Client ID ou Client Secret do Bradesco não configurados.');
    }

    const agent = createBradescoAgent();
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
        agent: agent
    };

    console.log("Requisitando token de acesso do Bradesco...");
    return new Promise((resolve, reject) => {
        const req = https.request(tokenEndpoint, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                console.log(`Resposta do Token Bradesco (Status ${res.statusCode}):`, data);
                try {
                    const jsonData = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(jsonData);
                    } else {
                        const errorMessage = jsonData.error_description || jsonData.error || `Erro ${res.statusCode}: ${data}`;
                        reject(new Error(errorMessage));
                    }
                } catch (e) {
                    reject(new Error(`Falha ao processar resposta do servidor de token: ${data}`));
                }
            });
        });
        req.on('error', (e) => reject(new Error(`Erro na requisição de token: ${e.message}`)));
        req.write(postData);
        req.end();
    });
}

// Função para registrar o Boleto
export async function registrarBoleto(accessToken, dadosBoletoPayload) {
    const agent = createBradescoAgent();
    const apiEndpoint = 'https://openapisandbox.prebanco.com.br/boleto/cobranca-registro/v1/cobranca';
    const payloadFinal = JSON.stringify(dadosBoletoPayload);

    console.log("Payload final a ser enviado para o Bradesco:", payloadFinal);

    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
            'Content-Length': Buffer.byteLength(payloadFinal)
        },
        agent: agent
    };

    console.log("Registrando boleto no Bradesco...");
    return new Promise((resolve, reject) => {
        const req = https.request(apiEndpoint, options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                console.log(`Resposta do Registro de Boleto (Status ${res.statusCode}):`, data);
                try {
                    const jsonData = JSON.parse(data);
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve(jsonData);
                    } else {
                        const errorDetails = jsonData.erros ? JSON.stringify(jsonData.erros) : data;
                        reject(new Error(`Erro ${res.statusCode} ao registrar boleto: ${errorDetails}`));
                    }
                } catch (e) {
                    reject(new Error(`Falha ao processar resposta do Bradesco no registro: ${data}`));
                }
            });
        });
        req.on('error', (e) => reject(new Error(`Erro na requisição de registro: ${e.message}`)));
        req.write(payloadFinal);
        req.end();
    });
}