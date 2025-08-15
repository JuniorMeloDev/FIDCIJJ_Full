import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseServerClient';
import jwt from 'jsonwebtoken';


export async function PUT(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = params;
        const body = await request.json();

        const { data, error } = await supabase
            .from('tipos_operacao')
            .update({
                nome: body.nome,
                taxa_juros: body.taxaJuros,
                valor_fixo: body.valorFixo,
                despesas_bancarias: body.despesasBancarias,
                descricao: body.descricao,
                // Novos campos
                usar_prazo_sacado: body.usarPrazoSacado,
                usar_peso_no_valor_fixo: body.usarPesoNoValorFixo,
            })
            .eq('id', id)
            .select();

        if (error) throw error;
        return NextResponse.json(data[0], { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

export async function DELETE(request, { params }) {
     try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = params;
        const { error } = await supabase.from('tipos_operacao').delete().eq('id', id);

        if (error) throw error;
        return new NextResponse(null, { status: 204 }); // No Content
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}