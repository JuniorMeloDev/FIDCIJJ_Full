import { NextResponse } from 'next/server';
import { supabase } from '@/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    // Adicione a validação do token aqui depois
    const { data, error } = await supabase.from('tipos_operacao').select('*');
    if (error) {
        return NextResponse.json({ message: 'Erro ao buscar tipos de operação' }, { status: 500 });
    }
    return NextResponse.json(data, { status: 200 });
}