import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

// PUT: Atualiza uma anotação
export async function PUT(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = await params;
        const body = await request.json();

        // Sanitiza o corpo da requisição para evitar atualização de campos proibidos (como id)
        const updateData = {
            data: body.data,
            assunto: body.assunto,
            conteudo: body.conteudo,
            // Adicione anexo_url se for atualizável via PUT, mas geralmente anexo requer lógica de upload separada ou igual ao POST
            // Se o frontend enviar anexo_url já processado:
            ...(body.anexo_url !== undefined && { anexo_url: body.anexo_url }) 
        };

        const { error } = await supabase
            .from('anotacoes')
            .update(updateData)
            .eq('id', id);

        if (error) {
            console.error("Erro ao atualizar anotação:", error);
            throw error;
        }

        return new NextResponse(null, { status: 204 });
    } catch (error) {
        console.error("Erro interno na API PUT /agenda/[id]:", error);
        return NextResponse.json({ message: error.message || "Erro interno ao atualizar" }, { status: 500 });
    }
}

// DELETE: Apaga uma anotação
export async function DELETE(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = await params;
        const { error } = await supabase.from('anotacoes').delete().eq('id', id);

        if (error) throw error;
        return new NextResponse(null, { status: 204 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}