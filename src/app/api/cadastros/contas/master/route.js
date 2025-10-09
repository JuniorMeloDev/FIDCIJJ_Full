import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        // Adicionando a validação de token que estava pendente
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        // --- CORREÇÃO APLICADA AQUI ---
        // A consulta agora filtra apenas as contas onde 'cliente_id' é NULO,
        // que são consideradas as contas master da sua empresa.
        const { data, error } = await supabase
            .from('contas_bancarias')
            .select('*')
            .is('cliente_id', null);

        if (error) {
            console.error("Erro ao buscar contas master:", error);
            throw new Error('Erro ao buscar as contas da empresa.');
        }
        
        return NextResponse.json(data, { status: 200 });

    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}