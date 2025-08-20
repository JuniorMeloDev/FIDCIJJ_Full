import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

const getUserIdFromToken = async (token) => {
    if (!token) return null;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const username = decoded.sub;
    const { data: user } = await supabase.from('users').select('id').eq('username', username).single();
    return user?.id || null;
};

// GET: Busca anotações (sem alterações)
export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        const userId = await getUserIdFromToken(token);
        if (!userId) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });

        const { searchParams } = new URL(request.url);
        let query = supabase.from('anotacoes').select('*').eq('user_id', userId);

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


// POST: Cria uma nova anotação com anexo
export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        const userId = await getUserIdFromToken(token);
        if (!userId) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });

        const formData = await request.formData();
        const data = formData.get('data');
        const assunto = formData.get('assunto');
        const conteudo = formData.get('conteudo');
        const anexo = formData.get('anexo');
        
        if (!data || !assunto) {
            return NextResponse.json({ message: 'Data e Assunto são obrigatórios.' }, { status: 400 });
        }

        let anexoUrl = null;

        if (anexo && anexo.size > 0) {
            const fileName = `${userId}/${Date.now()}-${anexo.name}`;
            const { error: uploadError } = await supabase.storage
                .from('anexos_agenda')
                .upload(fileName, anexo);

            if (uploadError) {
                console.error('Erro de upload no Supabase:', uploadError);
                throw new Error('Falha ao fazer upload do anexo.');
            }

            const { data: publicUrlData } = supabase.storage
                .from('anexos_agenda')
                .getPublicUrl(fileName);
            
            anexoUrl = publicUrlData.publicUrl;
        }

        const { data: novaAnotacao, error: insertError } = await supabase
            .from('anotacoes')
            .insert([{ data, assunto, conteudo, anexo_url: anexoUrl, user_id: userId }])
            .select()
            .single();

        if (insertError) {
            console.error('Erro do Supabase ao inserir anotação:', insertError);
            throw insertError;
        }
        return NextResponse.json(novaAnotacao, { status: 201 });
    } catch (error) {
        console.error('Erro na API POST /api/agenda:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}

// DELETE: Apaga múltiplas anotações e seus anexos
export async function DELETE(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        const userId = await getUserIdFromToken(token);
        if (!userId) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });

        const { ids } = await request.json();

        if (!ids || !Array.isArray(ids) || ids.length === 0) {
            return NextResponse.json({ message: 'Nenhum ID fornecido para exclusão.' }, { status: 400 });
        }
        
        // 1. Buscar as URLs dos anexos para apagar do storage
        const { data: anotacoesParaExcluir, error: selectError } = await supabase
            .from('anotacoes')
            .select('anexo_url')
            .in('id', ids)
            .eq('user_id', userId);

        if(selectError) throw selectError;

        // 2. Apagar os arquivos do storage
        const arquivosParaRemover = anotacoesParaExcluir
            .map(a => a.anexo_url ? a.anexo_url.split('/').pop() : null)
            .filter(Boolean);
            
        if (arquivosParaRemover.length > 0) {
            // Corrige o path para o storage
            const filePaths = arquivosParaRemover.map(fileName => `${userId}/${fileName}`);
            await supabase.storage.from('anexos_agenda').remove(filePaths);
        }

        // 3. Apagar os registros do banco de dados
        const { error: deleteError } = await supabase
            .from('anotacoes')
            .delete()
            .in('id', ids)
            .eq('user_id', userId);

        if (deleteError) throw deleteError;
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}