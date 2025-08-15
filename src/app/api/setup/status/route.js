import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

// GET: Verifica se a configuração inicial (cadastro de cliente) é necessária
export async function GET(request) {
    try {
        // Valida o token de autenticação
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        // Conta quantos clientes existem na base de dados
        const { count, error } = await supabase
            .from('clientes')
            .select('*', { count: 'exact', head: true }); // 'head: true' otimiza a contagem

        if (error) {
            console.error('Erro ao contar clientes:', error);
            throw new Error('Falha ao verificar o status da configuração.');
        }

        // Se a contagem for 0, o setup é necessário
        const needsSetup = count === 0;

        return NextResponse.json({ needsSetup }, { status: 200 });

    } catch (error) {
        console.error('Erro no endpoint de status:', error.message);
        // Se o token for inválido, o jwt.verify lança um erro, que é capturado aqui
        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
             return NextResponse.json({ message: 'Token inválido ou expirado' }, { status: 403 });
        }
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}