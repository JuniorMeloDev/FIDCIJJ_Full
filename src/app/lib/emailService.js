import nodemailer from 'nodemailer';
import fs from 'fs'; // Import 'fs'
import path from 'path';

// Função para gerar senha forte (mantida como estava no seu arquivo original)
export const generateStrongPassword = () => {
    const length = 10;
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const numbers = '0123456789';
    const special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
    const all = lower + upper + numbers + special;
    let password = '';
    password += lower[Math.floor(Math.random() * lower.length)];
    password += upper[Math.floor(Math.random() * upper.length)];
    password += numbers[Math.floor(Math.random() * numbers.length)];
    password += special[Math.floor(Math.random() * special.length)];
    for (let i = 4; i < length; i++) {
        password += all[Math.floor(Math.random() * all.length)];
    }
    return password.split('').sort(() => 0.5 - Math.random()).join('');
};

// --- CORREÇÃO APLICADA AQUI ---
// O transporter foi movido para dentro da função 'sendEmail'
// para usar as credenciais corretas do Resend.
// --- FIM DA CORREÇÃO ---

export async function sendWelcomeEmail({ clienteNome, username, tempPassword, recipientEmail }) {
    // Configura o transporter dentro da função (Resend)
    const transporter = nodemailer.createTransport({
        host: 'smtp.resend.com',
        secure: true,
        port: 465,
        auth: {
            user: 'resend',
            pass: process.env.RESEND_API_KEY, // Usa a chave do Resend
        },
    });

    if (!clienteNome || !username || !tempPassword || !recipientEmail) {
        throw new Error('Dados insuficientes para enviar o e-mail de boas-vindas.');
    }
    const loginUrl = process.env.NEXT_PUBLIC_LOGIN_URL || 'https://fidcijj.vercel.app/login';
    
    // --- Lógica de Carregamento do Logo (CORRIGIDA) ---
    let logoBase64 = null;
    try {
        const imagePath = path.resolve(process.cwd(), 'public', 'Logo.png');
        if (fs.existsSync(imagePath)) {
            const file = fs.readFileSync(imagePath);
            logoBase64 = `data:image/png;base64,${file.toString('base64')}`;
            console.log(`[EmailService/Welcome] Logo.png carregado com sucesso de: ${imagePath}`);
        } else {
            console.warn(`[EmailService/Welcome] Logo.png NÃO encontrado em: ${imagePath}. Tentando fallback 'logo.png'.`);
            const fallbackPath = path.resolve(process.cwd(), 'public', 'logo.png');
             if (fs.existsSync(fallbackPath)) {
                 const file = fs.readFileSync(fallbackPath);
                 logoBase64 = `data:image/png;base64,${file.toString('base64')}`;
                 console.log(`[EmailService/Welcome] Fallback 'logo.png' carregado de: ${fallbackPath}`);
            } else {
                 console.warn(`[EmailService/Welcome] Fallback 'logo.png' também NÃO encontrado.`);
            }
        }
    } catch (error) {
        console.error(`[EmailService/Welcome] Erro ao carregar Logo.png:`, error);
    }
    // --- Fim da Lógica do Logo ---

    // Inclui o logo no corpo do email se encontrado
    const emailBody = `
    <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
        ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" style="max-width: 150px; margin-bottom: 20px;">` : ''}
        <p>Olá, <strong>${clienteNome}</strong>!</p>
        <p>Seja bem-vindo(a) à IJJ FIDC! Estamos felizes em tê-lo(a) conosco.</p>
        <p>Para acessar nosso portal do cliente, utilize as credenciais provisórias abaixo:</p>
        <div style="background-color: #f2f2f2; padding: 20px; border-radius: 8px; margin: 25px 0; font-size: 16px;">
            <p style="margin: 5px 0;"><strong>URL de Acesso:</strong> <a href="${loginUrl}" target="_blank">${loginUrl}</a></p>
            <p style="margin: 5px 0;"><strong>Usuário:</strong> ${username}</p>
            <p style="margin: 5px 0;"><strong>Senha Provisória:</strong> <span style="font-weight: bold; color: #d9534f;">${tempPassword}</span></p>
        </div>
        <p>Por segurança, recomendamos fortemente que você <strong>altere sua senha</strong> no primeiro acesso através do menu "Perfil".</p>
        <br>
        <p>Atenciosamente,</p>
        <p><strong>Equipe FIDC IJJ</strong></p>
        <p style="margin-top: 20px; font-size: 12px; color: #888;">Esta é uma mensagem automática, por favor, não responda.</p>
    </div>
    `;
    
    await transporter.sendMail({
        from: `"FIDC IJJ" <nao-responda@fidcijj.com.br>`, // Remetente do Resend
        to: recipientEmail,
        subject: 'Bem-vindo(a) ao Portal do Cliente FIDC IJJ',
        html: emailBody,
        // attachments: logoBase64 ? [{ filename: 'Logo.png', path: logoBase64, cid: 'logoImage' }] : [] // Não precisa mais de CID
    });
}

// Funções sendOperationSubmittedEmail e sendOperationStatusEmail (usando Resend e com logo)
export async function sendOperationSubmittedEmail({ clienteNome, operacaoId, valorLiquido, adminEmails }) {
    const transporter = nodemailer.createTransport({ /* ...config Resend... */
        host: 'smtp.resend.com', secure: true, port: 465,
        auth: { user: 'resend', pass: process.env.RESEND_API_KEY },
    });
    // ... (lógica para carregar logoBase64 igual a sendWelcomeEmail) ...
    let logoBase64 = null; /* ... lógica de carregamento ... */
    try { /* ... */ } catch (error) { /* ... */ }

    if (!clienteNome || !operacaoId || !valorLiquido || !adminEmails || adminEmails.length === 0) {
        return;
    }
    const analysisUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://fidcijj.vercel.app'}/analise`;
    const emailBody = `
        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
            ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" style="max-width: 150px; margin-bottom: 20px;">` : ''}
            <p>Olá,</p>
            <p>Uma nova operação foi enviada para análise.</p>
            <div style="background-color: #f2f2f2; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p><strong>Cliente:</strong> ${clienteNome}</p>
                <p><strong>ID da Operação:</strong> #${operacaoId}</p>
                <p><strong>Valor Líquido:</strong> ${new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valorLiquido)}</p>
            </div>
            <p>Por favor, acesse o painel de administração para analisar e aprovar a operação.</p>
            <p><a href="${analysisUrl}" target="_blank">Analisar Operação</a></p>
            <br>
            <p>Atenciosamente,</p>
            <p><strong>Sistema FIDC IJJ</strong></p>
            <p style="margin-top: 20px; font-size: 12px; color: #888;">Esta é uma mensagem automática.</p>
        </div>
    `;
    await transporter.sendMail({
        from: `"FIDC IJJ - Alerta" <nao-responda@fidcijj.com.br>`,
        to: adminEmails.join(','),
        subject: `Nova Operação #${operacaoId} para Análise - ${clienteNome}`,
        html: emailBody,
    });
}

export async function sendOperationStatusEmail({ clienteNome, operacaoId, status, recipientEmail }) {
     const transporter = nodemailer.createTransport({ /* ...config Resend... */
        host: 'smtp.resend.com', secure: true, port: 465,
        auth: { user: 'resend', pass: process.env.RESEND_API_KEY },
     });
     // ... (lógica para carregar logoBase64 igual a sendWelcomeEmail) ...
     let logoBase64 = null; /* ... lógica de carregamento ... */
     try { /* ... */ } catch (error) { /* ... */ }

     if (!clienteNome || !operacaoId || !status || !recipientEmail) {
        return;
    }
    const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://fidcijj.vercel.app'}/portal/dashboard`;
    const subject = `Sua Operação #${operacaoId} foi ${status === 'Aprovada' ? 'Aprovada' : 'Rejeitada'}`;
    const emailBody = `
        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
            ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" style="max-width: 150px; margin-bottom: 20px;">` : ''}
            <p>Olá, <strong>${clienteNome}</strong>!</p>
            <p>Temos uma atualização sobre a sua operação enviada para análise.</p>
            <div style="background-color: #f2f2f2; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p><strong>ID da Operação:</strong> #${operacaoId}</p>
                <p><strong>Novo Status:</strong> <strong style="color: ${status === 'Aprovada' ? 'green' : 'red'};">${status}</strong></p>
            </div>
            ${status === 'Aprovada' ? '<p>O valor líquido será creditado na conta bancária informada em breve.</p>' : '<p>Para mais detalhes sobre o motivo da rejeição, entre em contato conosco.</p>'}
            <p>Você pode ver mais detalhes acessando o portal do cliente:</p>
            <p><a href="${portalUrl}" target="_blank">Acessar Portal</a></p>
            <br>
            <p>Atenciosamente,</p>
            <p><strong>Equipe FIDC IJJ</strong></p>
            <p style="margin-top: 20px; font-size: 12px; color: #888;">Esta é uma mensagem automática, por favor, não responda.</p>
        </div>
    `;
     await transporter.sendMail({
        from: `"FIDC IJJ" <nao-responda@fidcijj.com.br>`,
        to: recipientEmail,
        subject: subject,
        html: emailBody,
    });
}

// Função sendCustomNotificationEmail (usando Resend e com logo)
export async function sendCustomNotificationEmail({ title, message, recipientEmails, attachments = [], isDetailedEmail = true }) {
    const transporter = nodemailer.createTransport({ /* ...config Resend... */
        host: 'smtp.resend.com', secure: true, port: 465,
        auth: { user: 'resend', pass: process.env.RESEND_API_KEY },
    });
    // --- Lógica de Carregamento do Logo (CORRIGIDA) ---
    let logoBase64 = null;
    try {
        const imagePath = path.resolve(process.cwd(), 'public', 'Logo.png');
        if (fs.existsSync(imagePath)) {
            const file = fs.readFileSync(imagePath);
            logoBase64 = `data:image/png;base64,${file.toString('base64')}`;
            console.log(`[EmailService/Custom] Logo.png carregado com sucesso de: ${imagePath}`);
        } else {
             console.warn(`[EmailService/Custom] Logo.png NÃO encontrado em: ${imagePath}. Tentando fallback 'logo.png'.`);
            const fallbackPath = path.resolve(process.cwd(), 'public', 'logo.png');
            if (fs.existsSync(fallbackPath)) {
                 const file = fs.readFileSync(fallbackPath);
                 logoBase64 = `data:image/png;base64,${file.toString('base64')}`;
                 console.log(`[EmailService/Custom] Fallback 'logo.png' carregado de: ${fallbackPath}`);
            } else {
                 console.warn(`[EmailService/Custom] Fallback 'logo.png' também NÃO encontrado.`);
            }
        }
    } catch (error) {
        console.error(`[EmailService/Custom] Erro ao carregar Logo.png:`, error);
    }
    // --- Fim da Lógica do Logo ---

    if (!title || !recipientEmails || recipientEmails.length === 0) {
        return;
    }

    let emailBody;
    const portalUrl = process.env.NEXT_PUBLIC_LOGIN_URL || 'https://fidcijj.vercel.app/login';

    if (isDetailedEmail) {
        // Lógica para o e-mail completo (com mensagem e anexos)
        emailBody = `
            <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
                ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" style="max-width: 150px; margin-bottom: 20px;">` : ''}
                ${message}
                <br><br>
                <p>Atenciosamente,</p>
                <p><strong>Equipe FIDC IJJ</strong></p>
                <p style="margin-top: 20px; font-size: 12px; color: #888;">Esta é uma mensagem automática, por favor, não responda.</p>
            </div>
        `;
    } else {
        // Lógica para o e-mail genérico (apenas aviso)
        emailBody = `
             <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
                ${logoBase64 ? `<img src="${logoBase64}" alt="Logo" style="max-width: 150px; margin-bottom: 20px;">` : ''}
                <p>Olá,</p>
                <p>Você recebeu uma nova notificação em nosso portal de clientes.</p>
                <p><strong>Assunto:</strong> ${title}</p>
                <br>
                <p>Para visualizar os detalhes, por favor, acesse o portal.</p>
                <p><a href="${portalUrl}" target="_blank" style="display: inline-block; padding: 10px 20px; background-color: #f97316; color: #ffffff; text-decoration: none; border-radius: 5px;">Acessar Portal FIDC IJJ</a></p>
                <br>
                <p>Atenciosamente,</p>
                <p><strong>Equipe FIDC IJJ</strong></p>
                <p style="margin-top: 20px; font-size: 12px; color: #888;">Esta é uma mensagem automática, por favor, não responda.</p>
            </div>
        `;
    }

    // Não precisamos mais do anexo embutido (CID)

    await transporter.sendMail({
        from: `"FIDC IJJ" <nao-responda@fidcijj.com.br>`,
        to: recipientEmails.join(', '),
        subject: isDetailedEmail ? title : 'Você tem uma nova notificação no Portal FIDC IJJ',
        html: emailBody,
        attachments: attachments // Passa os anexos (se houver) diretamente
    });
}