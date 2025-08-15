import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseServerClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { data, error } = await supabase.from('tipos_operacao').select('*').order('id', { ascending: true });

        if (error) throw error;
        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}


export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const body = await request.json();

        const { data, error } = await supabase
            .from('tipos_operacao')
            .insert([{
                nome: body.nome,
                taxa_juros: body.taxaJuros,
                valor_fixo: body.valorFixo,
                despesas_bancarias: body.despesasBancarias,
                descricao: body.descricao,
                usar_prazo_sacado: body.usarPrazoSacado,
                usar_peso_no_valor_fixo: body.usarPesoNoValorFixo,
            }])
            .select();

        if (error) throw error;
        return NextResponse.json(data[0], { status: 201 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}