import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

// GET: Retorna a contagem de notificações não lidas para o usuário autenticado
export async function GET(request) {
    console.log('[LOG] Rota GET /api/notifications/unread-count foi chamada.');
    try {
        const authHeader = request.headers.get('Authorization');
        console.log(`[LOG] Cabeçalho de Autorização: ${authHeader ? 'Presente' : 'Ausente'}`);

        const token = authHeader?.split(' ')[1];
        if (!token) {
            console.error('[ERRO] Token não fornecido no cabeçalho.');
            return NextResponse.json({ message: 'Token não fornecido.' }, { status: 401 });
        }
        console.log('[LOG] Token extraído com sucesso.');

        let decoded;
        try {
            decoded = jwt.verify(token, process.env.JWT_SECRET);
            // Log detalhado do conteúdo do token para depuração
            console.log('[LOG] Token decodificado:', JSON.stringify(decoded, null, 2));
        } catch (jwtError) {
            console.error('[ERRO] Falha na verificação do JWT:', jwtError);
            return NextResponse.json({ message: `Token JWT inválido: ${jwtError.message}` }, { status: 401 });
        }
        
        const userId = decoded.user_id; 
        console.log(`[LOG] Tentando usar user_id do token: ${userId}`);
        
        if (!userId) {
            console.error("[ERRO CRÍTICO] O token de autenticação não contém o 'user_id' (UUID) necessário.");
            return NextResponse.json({ message: 'Token de autenticação inválido ou mal configurado.' }, { status: 401 });
        }

        console.log(`[LOG] Executando consulta no Supabase para user_id: ${userId}`);
        const { count, error } = await supabase
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_read', false);

        if (error) {
            console.error("[ERRO] Erro na consulta ao Supabase:", error);
            return NextResponse.json({ message: `Erro na consulta de notificações: ${error.message}` }, { status: 500 });
        }
        
        console.log(`[LOG] Consulta bem-sucedida. Contagem de notificações não lidas: ${count}`);
        return NextResponse.json({ count: count || 0 }, { status: 200 });

    } catch (error) {
        // Este catch agora pegará outros erros inesperados
        console.error("[ERRO GERAL] Erro inesperado na rota unread-count:", error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}
