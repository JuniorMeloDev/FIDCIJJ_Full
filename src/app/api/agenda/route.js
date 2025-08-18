import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

// Função auxiliar para obter o ID do usuário a partir do username no token
const getUserIdFromToken = async (token) => {
    if (!token) return null;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const username = decoded.sub;

    const { data: user, error } = await supabase
        .from('users')
        .select('id')
        .eq('username', username)
        .single();

    if (error || !user) {
        console.error('Usuário não encontrado para o token:', error);
        return null;
    }
    return user.id;
};

// GET: Busca anotações com filtros
export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        const userId = await getUserIdFromToken(token);
        if (!userId) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        let query = supabase.from('anotacoes').select('*').eq('user_id', userId);

        // Filtros
        if (searchParams.get('dataInicio')) query = query.gte('data', searchParams.get('dataInicio'));
        if (searchParams.get('dataFim')) query = query.lte('data', searchParams.get('dataFim'));
        if (searchParams.get('assunto')) query = query.ilike('assunto', `%${searchParams.get('assunto')}%`);

        query = query.order('data', { ascending: false });

        const { data, error } = await query;
        if (error) throw error;

        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

// POST: Cria uma nova anotação
export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        const userId = await getUserIdFromToken(token);
        if (!userId) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });

        const body = await request.json();
        
        if (!body.data || !body.assunto) {
            return NextResponse.json({ message: 'Data e Assunto são obrigatórios.' }, { status: 400 });
        }

        const { data, error } = await supabase
            .from('anotacoes')
            .insert([{ ...body, user_id: userId }])
            .select()
            .single();

        if (error) {
            console.error('Erro do Supabase ao inserir:', error);
            throw error;
        }
        return NextResponse.json(data, { status: 201 });
    } catch (error) {
        console.error('Erro na API POST /api/agenda:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}

// DELETE: Apaga múltiplas anotações
export async function DELETE(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        const userId = await getUserIdFromToken(token);
        if (!userId) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });

        const { ids } = await request.json();

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ message: 'Nenhum ID fornecido para exclusão.' }, { status: 400 });
        }

        const { error } = await supabase
            .from('anotacoes')
            .delete()
            .in('id', ids)
            .eq('user_id', userId); // Garante que o usuário só pode apagar suas próprias anotações

        if (error) throw error;
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}