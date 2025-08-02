import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        // 1. Validar o token de autenticação
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ message: 'Não autorizado: Token em falta' }, { status: 401 });
        }

        const token = authHeader.substring(7); // Remove "Bearer "

        try {
            jwt.verify(token, process.env.JWT_SECRET);
            // Se o token for inválido, o jwt.verify irá lançar um erro
        } catch (error) {
            return NextResponse.json({ message: 'Não autorizado: Token inválido' }, { status: 403 });
        }

        // 2. Se o token for válido, busca os dados no Supabase
        // Esta consulta replica a lógica do seu backend Java: agrupa por conta e soma os valores.
        const { data, error } = await supabase.rpc('get_saldos_por_conta');

        if (error) {
            console.error("Erro ao buscar saldos:", error);
            throw new Error("Falha ao consultar os saldos no banco de dados.");
        }

        // O Supabase RPC retorna um formato diferente, vamos ajustar para o que o frontend espera
        // { conta_bancaria: 'Nome da Conta', saldo: 123.45 }
        const formattedData = data.map(item => ({
            contaBancaria: item.conta_bancaria,
            saldo: item.saldo
        }));

        return NextResponse.json(formattedData, { status: 200 });

    } catch (error) {
        console.error('Erro no endpoint de saldos:', error.message);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}