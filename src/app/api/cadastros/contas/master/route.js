import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseServerClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    // Adicione a validação do token aqui depois
    const { data, error } = await supabase.from('contas_bancarias').select('*');
    if (error) {
        return NextResponse.json({ message: 'Erro ao buscar contas' }, { status: 500 });
    }
    return NextResponse.json(data, { status: 200 });
}