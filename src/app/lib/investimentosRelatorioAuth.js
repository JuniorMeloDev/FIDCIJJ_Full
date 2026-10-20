import { ensureAuthenticated } from "./investimentos.js";

export function reportUser(request) {
  let user;
  try { user = ensureAuthenticated(request); } catch { throw Object.assign(new Error("Não autorizado."), { status: 401 }); }
  const roles = Array.isArray(user.roles) ? user.roles : String(user.roles || "").split(",").map((role) => role.trim());
  if (!roles.some((role) => ["ROLE_ADMIN", "ROLE_USER"].includes(role))) throw Object.assign(new Error("Acesso restrito à equipe interna."), { status: 403 });
  const key = user.user_id || user.sub;
  if (!key) throw Object.assign(new Error("Sessão inválida. Entre novamente."), { status: 401 });
  return String(key);
}

export function reportError(error) {
  // Não retorna detalhes de credenciais SMTP ou do banco para o cliente.
  const status = error.status || 500;
  return { status, message: status < 500 ? error.message : "Não foi possível processar o relatório. Verifique a configuração do banco e do e-mail." };
}
