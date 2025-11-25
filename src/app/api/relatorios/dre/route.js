import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);
        const dataInicio = searchParams.get('dataInicio');
        const dataFim = searchParams.get('dataFim');

        const { data, error } = await supabase.rpc('get_dre_data', {
            p_data_inicio: dataInicio || null,
            p_data_fim: dataFim || null
        });

        if (error) throw error;

        // Processa os dados para o formato do relatório
        const receitaJuros = data.find(d => d.descricao === 'Receita com Deságio (Juros)')?.valor || 0;
        const outrasReceitas = data.filter(d => d.grupo === 'RECEITAS' && d.descricao !== 'Receita com Deságio (Juros)')
                                   .reduce((acc, curr) => acc + curr.valor, 0);
        
        const despesas = data.filter(d => d.grupo === 'DESPESAS');
        const totalDespesas = despesas.reduce((acc, curr) => acc + curr.valor, 0);

        const totalReceitas = receitaJuros + outrasReceitas;
        const lucroLiquido = totalReceitas - totalDespesas;

        const reportData = {
            receitas: [
                { descricao: 'Receita Bruta com Deságio', valor: receitaJuros },
                { descricao: 'Outras Receitas Operacionais', valor: outrasReceitas }
            ],
            totalReceitas,
            despesas: despesas.map(d => ({ descricao: d.descricao, valor: d.valor })),
            totalDespesas,
            lucroLiquido
        };

        return NextResponse.json(reportData, { status: 200 });

    } catch (error) {
        console.error("Erro na API DRE:", error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}