import { NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import path from 'path';

export async function POST(request) {
    try {
        const body = await request.json();
        const { clienteNome, username, tempPassword, recipientEmail } = body;

        if (!clienteNome || !username || !tempPassword || !recipientEmail) {
            return NextResponse.json({ message: 'Dados insuficientes para enviar o e-mail.' }, { status: 400 });
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

        const portalUrl = process.env.NEXT_PUBLIC_PORTAL_URL || 'https://fidcijj.vercel.app/portal/dashboard';
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
                <p>
                    <strong>Equipe FIDC IJJ</strong><br>
                </p>
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

        return NextResponse.json({ message: 'E-mail de boas-vindas enviado com sucesso!' }, { status: 200 });

    } catch (error) {
        console.error("Erro ao enviar e-mail de boas-vindas:", error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}