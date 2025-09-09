import nodemailer from 'nodemailer';
import path from 'path';

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

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
    },
});

export async function sendWelcomeEmail({ clienteNome, username, tempPassword, recipientEmail }) {
    if (!clienteNome || !username || !tempPassword || !recipientEmail) {
        throw new Error('Dados insuficientes para enviar o e-mail de boas-vindas.');
    }
    const loginUrl = process.env.NEXT_PUBLIC_LOGIN_URL || 'https://fidcijj.vercel.app/login';
    
    // *** CORPO DO E-MAIL CORRIGIDO E DETALHADO ***
    const emailBody = `
    <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
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
    </div>
    `;

    await transporter.sendMail({
        from: `"FIDC IJJ" <${process.env.EMAIL_USERNAME}>`,
        to: recipientEmail,
        subject: 'Bem-vindo(a) ao Portal do Cliente FIDC IJJ',
        html: emailBody,
    });
}

export async function sendOperationSubmittedEmail({ clienteNome, operacaoId, valorLiquido, adminEmails }) {
    if (!clienteNome || !operacaoId || !valorLiquido || !adminEmails || adminEmails.length === 0) {
        return;
    }
    const analysisUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://fidcijj.vercel.app'}/analise`;
    const emailBody = `
        <div style="font-family: Arial, sans-serif; color: #333;">
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
        </div>
    `;
    await transporter.sendMail({
        from: `"FIDC IJJ - Alerta" <${process.env.EMAIL_USERNAME}>`,
        to: adminEmails.join(','),
        subject: `Nova Operação #${operacaoId} para Análise - ${clienteNome}`,
        html: emailBody,
    });
}

export async function sendOperationStatusEmail({ clienteNome, operacaoId, status, recipientEmail }) {
     if (!clienteNome || !operacaoId || !status || !recipientEmail) {
        return; 
    }
    const portalUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://fidcijj.vercel.app'}/portal/dashboard`;
    const subject = `Sua Operação #${operacaoId} foi ${status === 'Aprovada' ? 'Aprovada' : 'Rejeitada'}`;

     const emailBody = `
        <div style="font-family: Arial, sans-serif; color: #333;">
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
        </div>
    `;

     await transporter.sendMail({
        from: `"FIDC IJJ" <${process.env.EMAIL_USERNAME}>`,
        to: recipientEmail,
        subject: subject,
        html: emailBody,
    });
}