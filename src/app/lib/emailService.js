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

export async function sendWelcomeEmail({ clienteNome, username, tempPassword, recipientEmail }) {
    if (!clienteNome || !username || !tempPassword || !recipientEmail) {
        throw new Error('Dados insuficientes para enviar o e-mail de boas-vindas.');
    }

    const transporter = nodemailer.createTransport({
        host: 'smtp.gmail.com',
        port: 587,
        secure: false,
        auth: {
            user: process.env.EMAIL_USERNAME,
            pass: process.env.EMAIL_PASSWORD,
        },
    });

    const loginUrl = process.env.NEXT_PUBLIC_LOGIN_URL || 'https://fidcijj.vercel.app/login';

    const emailBody = `
        <div style="font-family: Arial, sans-serif; color: #333;">
            <p>Olá, <strong>${clienteNome}</strong>!</p>
            <p>Seja bem-vindo(a) à IJJ FIDC! Estamos felizes em tê-lo(a) conosco.</p>
            <p>Para acessar nosso portal do cliente, utilize as credenciais provisórias abaixo:</p>
            <div style="background-color: #f2f2f2; padding: 15px; border-radius: 5px; margin: 20px 0;">
                <p><strong>URL de Acesso:</strong> <a href="${loginUrl}" target="_blank">${loginUrl}</a></p>
                <p><strong>Usuário:</strong> ${username}</p>
                <p><strong>Senha Provisória:</strong> ${tempPassword}</p>
            </div>
            <p>Por segurança, recomendamos fortemente que você <strong>altere sua senha</strong> no primeiro acesso através do menu "Perfil".</p>
            <br>
            <p>Atenciosamente,</p>
            <p><strong>Equipe FIDC IJJ</strong></p>
        </div>
    `;

    const logoPath = path.resolve(process.cwd(), 'public', 'Logo.png');

    await transporter.sendMail({
        from: `"FIDC IJJ" <${process.env.EMAIL_USERNAME}>`,
        to: recipientEmail,
        subject: 'Bem-vindo(a) ao Portal do Cliente FIDC IJJ',
        html: emailBody,
        attachments: [
            {
                filename: 'Logo.png',
                path: logoPath,
                cid: 'logoImage'
            }
        ],
    });
}