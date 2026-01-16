import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

const sanitizeFileName = (name) => {
    return name.replace(/\s+/g, '_').replace(/[^a-zA-Z0-9.\-_]/g, '');
};

// PUT: Atualiza uma anotação
export async function PUT(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userId = decoded.user_id; // Pega ID do token

        const { id } = await params;
        
        // Tenta processar como FormData (padrão do frontend atual)
        let data, assunto, conteudo, anexo;
        try {
            const formData = await request.formData();
            data = formData.get('data');
            assunto = formData.get('assunto');
            conteudo = formData.get('conteudo');
            anexo = formData.get('anexo');
        } catch (e) {
            // Fallback para JSON se não for FormData (para compatibilidade futura ou testes)
            try {
                const body = await request.json();
                data = body.data;
                assunto = body.assunto;
                conteudo = body.conteudo;
                // JSON não suporta upload de arquivo binário direto aqui
            } catch (jsonErr) {
                 throw new Error("Formato de requisição inválido. Esperado FormData ou JSON.");
            }
        }

        const updateData = {
            data,
            assunto,
            conteudo
        };

        // Lógica de Upload se houver novo arquivo
        if (anexo && anexo.size > 0 && typeof anexo.name === 'string') {
            const cleanName = sanitizeFileName(anexo.name);
            const fileName = `${userId}/${Date.now()}-${cleanName}`;
            
            const { error: uploadError } = await supabase.storage
                .from('anexos_agenda')
                .upload(fileName, anexo);

            if (uploadError) {
                console.error('Erro de upload ao atualizar:', uploadError);
                throw new Error('Falha ao fazer upload do novo anexo.');
            }

            const { data: publicUrlData } = supabase.storage
                .from('anexos_agenda')
                .getPublicUrl(fileName);
            
            updateData.anexo_url = publicUrlData.publicUrl;
        }

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