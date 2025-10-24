import nodemailer from "nodemailer";
import fs from "fs";
import path from "path";

const getLogoBase64 = () => {
  try {
    // Caminho relativo da pasta 'lib' para a pasta 'public' no build da Vercel
    // __dirname aqui é /var/task/.next/server/app/lib
    let imagePath = path.resolve(__dirname, "../../../../public", "Logo.png");

    if (!fs.existsSync(imagePath)) {
      // Fallback para o caminho local (process.cwd())
      console.warn(
        `[EmailService] Logo não encontrado em ${imagePath}. Tentando path via CWD.`
      );
      imagePath = path.resolve(process.cwd(), "public", "Logo.png");
    }

    if (fs.existsSync(imagePath)) {
      console.log(`[EmailService] Logo.png carregado de: ${imagePath}`);
      const file = fs.readFileSync(imagePath);
      return `data:image/png;base64,${file.toString("base64")}`;
    } else {
      // Tenta fallback com 'logo.png' minúsculo
      let fallbackPath = path.resolve(
        __dirname,
        "../../../../public",
        "logo.png"
      );
      if (!fs.existsSync(fallbackPath)) {
        fallbackPath = path.resolve(process.cwd(), "public", "logo.png");
      }
      if (fs.existsSync(fallbackPath)) {
        console.log(
          `[EmailService] Fallback 'logo.png' carregado de: ${fallbackPath}`
        );
        const file = fs.readFileSync(fallbackPath);
        return `data:image/png;base64,${file.toString("base64")}`;
      } else {
        console.warn(`[EmailService] Logo.png ou logo.png NÃO encontrados.`);
        return null;
      }
    }
  } catch (error) {
    console.error(`[EmailService] Erro ao carregar Logo.png:`, error);
    return null;
  }
};

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true, // true para 465, false para 587
  auth: {
    user: process.env.EMAIL_USERNAME,
    pass: process.env.EMAIL_PASSWORD, // Lembre-se da "Senha de App" do Google
  },
});

export const generateStrongPassword = () => {
  // ... (sua função original de gerar senha) ...
  const length = 10;
  const lower = "abcdefghijklmnopqrstuvwxyz";
  const upper = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const numbers = "0123456789";
  const special = "!@#$%^&*()_+-=[]{}|;:,.<>?";
  const all = lower + upper + numbers + special;
  let password = "";
  password += lower[Math.floor(Math.random() * lower.length)];
  password += upper[Math.floor(Math.random() * upper.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  password += special[Math.floor(Math.random() * special.length)];
  for (let i = 4; i < length; i++) {
    password += all[Math.floor(Math.random() * all.length)];
  }
  return password
    .split("")
    .sort(() => 0.5 - Math.random())
    .join("");
};

export async function sendWelcomeEmail({
  clienteNome,
  username,
  tempPassword,
  recipientEmail,
}) {
  if (!clienteNome || !username || !tempPassword || !recipientEmail) {
    throw new Error("Dados insuficientes para enviar o e-mail de boas-vindas.");
  }
  const loginUrl =
    process.env.NEXT_PUBLIC_LOGIN_URL || "https://fidcijj.vercel.app/login";
  const logoBase64 = getLogoBase64(); // Função corrigida

  const emailBody = `
    <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
        ${
          logoBase64
            ? `<img src="${logoBase64}" alt="Logo FIDC IJJ" style="max-width: 150px; margin-bottom: 20px;">`
            : ""
        }
        <p>Olá, <strong>${clienteNome}</strong>!</p>
        <p>Seja bem-vindo(a) à IJJ FIDC!</p>
        <p>Para acessar nosso portal do cliente, utilize as credenciais provisórias abaixo:</p>
        <div style="background-color: #f2f2f2; padding: 20px; border-radius: 8px; margin: 25px 0; font-size: 16px;">
            <p style="margin: 5px 0;"><strong>URL de Acesso:</strong> <a href="${loginUrl}" target="_blank">${loginUrl}</a></p>
            <p style="margin: 5px 0;"><strong>Usuário:</strong> ${username}</p>
            <p style="margin: 5px 0;"><strong>Senha Provisória:</strong> <span style="font-weight: bold; color: #d9534f;">${tempPassword}</span></p>
        </div>
        <p>Por segurança, altere sua senha no primeiro acesso.</p>
        <br>
        <p>Atenciosamente,</p>
        <p><strong>Equipe FIDC IJJ</strong></p>
    </div>
    `;

  await transporter.sendMail({
    from: `"FIDC IJJ" <${process.env.EMAIL_USERNAME}>`, // Usa o seu e-mail do Gmail
    to: recipientEmail,
    subject: "Bem-vindo(a) ao Portal do Cliente FIDC IJJ",
    html: emailBody,
  });
}

export async function sendOperationSubmittedEmail({
  clienteNome,
  operacaoId,
  valorLiquido,
  adminEmails,
}) {
  if (
    !clienteNome ||
    !operacaoId ||
    valorLiquido == null ||
    !adminEmails ||
    adminEmails.length === 0
  ) {
    console.warn("[EmailService/Submitted] Dados insuficientes.");
    return;
  }
  const logoBase64 = getLogoBase64(); // Função corrigida
  const analysisUrl = `${
    process.env.NEXT_PUBLIC_APP_URL || "https://fidcijj.vercel.app"
  }/analise`;
  const emailBody = `
        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
            ${
              logoBase64
                ? `<img src="${logoBase64}" alt="Logo" style="max-width: 150px; margin-bottom: 20px;">`
                : ""
            }
            <p>Olá,</p>
            <p>Uma nova operação foi enviada para análise.</p>
            <p><strong>Cliente:</strong> ${clienteNome}</p>
            <p><strong>ID da Operação:</strong> #${operacaoId}</p>
            <p><strong>Valor Líquido Simulado:</strong> ${new Intl.NumberFormat(
              "pt-BR",
              { style: "currency", currency: "BRL" }
            ).format(valorLiquido)}</p>
            <p>Acesse o painel para analisar: <a href="${analysisUrl}" target="_blank">Analisar Operação</a></p>
        </div>
    `;
  await transporter.sendMail({
    from: `"FIDC IJJ - Alerta" <${process.env.EMAIL_USERNAME}>`, // Usa o seu e-mail do Gmail
    to: adminEmails.join(","),
    subject: `Nova Operação #${operacaoId} para Análise - ${clienteNome}`,
    html: emailBody,
  });
}

export async function sendOperationStatusEmail({
  clienteNome,
  operacaoId,
  status,
  recipientEmail,
}) {
  if (!clienteNome || !operacaoId || !status || !recipientEmail) {
    console.warn("[EmailService/Status] Dados insuficientes.");
    return;
  }
  const logoBase64 = getLogoBase64(); // Função corrigida
  const portalUrl = `${
    process.env.NEXT_PUBLIC_APP_URL || "https://fidcijj.vercel.app"
  }/portal/dashboard`;
  const subject = `Sua Operação #${operacaoId} foi ${
    status === "Aprovada" ? "Aprovada" : "Rejeitada"
  }`;
  const emailBody = `
        <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
            ${
              logoBase64
                ? `<img src="${logoBase64}" alt="Logo" style="max-width: 150px; margin-bottom: 20px;">`
                : ""
            }
            <p>Olá, <strong>${clienteNome}</strong>!</p>
            <p>Temos uma atualização sobre a sua operação #${operacaoId}.</p>
            <p><strong>Novo Status:</strong> <strong style="color: ${
              status === "Aprovada" ? "green" : "red"
            };">${status}</strong></p>
            <p>Acesse o portal para detalhes: <a href="${portalUrl}" target="_blank">Acessar Portal</a></p>
        </div>
    `;
  await transporter.sendMail({
    from: `"FIDC IJJ" <${process.env.EMAIL_USERNAME}>`, // Usa o seu e-mail do Gmail
    to: recipientEmail,
    subject: subject,
    html: emailBody,
  });
}

export async function sendCustomNotificationEmail({
  title,
  message,
  recipientEmails,
  attachments = [],
  isDetailedEmail = true,
}) {
  if (!title || !recipientEmails || recipientEmails.length === 0) {
    return;
  }
  const logoBase64 = getLogoBase64(); // Função corrigida
  const portalUrl =
    process.env.NEXT_PUBLIC_LOGIN_URL || "https://fidcijj.vercel.app/login";

  let emailBody;
  if (isDetailedEmail) {
    emailBody = `
            <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
                ${
                  logoBase64
                    ? `<img src="${logoBase64}" alt="Logo" style="max-width: 150px; margin-bottom: 20px;">`
                    : ""
                }
                ${message}
            </div>
        `;
  } else {
    emailBody = `
             <div style="font-family: Arial, sans-serif; color: #333; line-height: 1.6;">
                ${
                  logoBase64
                    ? `<img src="${logoBase64}" alt="Logo" style="max-width: 150px; margin-bottom: 20px;">`
                    : ""
                }
                <p>Olá,</p>
                <p>Você recebeu uma nova notificação: <strong>${title}</strong></p>
                <p>Acesse o portal para detalhes: <a href="${portalUrl}" target="_blank">Acessar Portal</a></p>
            </div>
        `;
  }

  await transporter.sendMail({
    from: `"FIDC IJJ" <${process.env.EMAIL_USERNAME}>`, // Usa o seu e-mail do Gmail
    to: recipientEmails.join(", "),
    subject: isDetailedEmail
      ? title
      : "Você tem uma nova notificação no Portal FIDC IJJ",
    html: emailBody,
    attachments: attachments,
  });
}
