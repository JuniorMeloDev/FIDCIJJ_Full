import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { startOfMonth, endOfMonth, subMonths, format } from 'date-fns';

export async function GET(request) {
    console.log('--- INÍCIO API VOLUME OPERADO ---');
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });

        let clienteId;
        try {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            clienteId = decoded.cliente_id;
        } catch (e) {
            return NextResponse.json({ message: 'Token inválido' }, { status: 401 });
        }

        if (!clienteId) {
            return NextResponse.json({ message: 'Usuário sem cliente associado.' }, { status: 403 });
        }

        const { searchParams } = new URL(request.url);
        const period = searchParams.get('period') || 'last_6_months';
        
        let startDate, endDate;
        const now = new Date();

        // Definição das datas
        switch (period) {
            case 'current_month':
                startDate = startOfMonth(now);
                endDate = endOfMonth(now);
                break;
            case 'last_month':
                const lastMonth = subMonths(now, 1);
                startDate = startOfMonth(lastMonth);
                endDate = endOfMonth(lastMonth);
                break;
            case 'current_year':
                startDate = new Date(now.getFullYear(), 0, 1);
                endDate = new Date(now.getFullYear(), 11, 31);
                break;
            case 'last_6_months':
            default:
                startDate = startOfMonth(subMonths(now, 5));
                endDate = endOfMonth(now);
                break;
        }

        console.log(`Periodo: ${period} | Buscando de ${format(startDate, 'yyyy-MM-dd')} até ${format(endDate, 'yyyy-MM-dd')}`);

        // Consulta ao Banco
        // Nota: Buscamos 'valor_bruto' (conforme sua correção anterior)
        const { data: operacoes, error } = await supabase
            .from('operacoes')
            .select(`
                data_operacao,
                status,
                duplicatas (
                    valor_bruto,
                    status_recebimento
                )
            `)
            .eq('cliente_id', clienteId)
            .eq('status', 'Aprovada') // A operação macro deve estar Aprovada
            .gte('data_operacao', format(startDate, 'yyyy-MM-dd'))
            .lte('data_operacao', format(endDate, 'yyyy-MM-dd'))
            .order('data_operacao', { ascending: true });

        if (error) {
            console.error('Erro Supabase Volume Operado:', error);
            throw error;
        }

        console.log(`Operações encontradas: ${operacoes?.length || 0}`);

        const volumePorMes = {};

        if (operacoes && operacoes.length > 0) {
            // Log de amostra para ver os status que estão vindo
            const amostraDuplicatas = operacoes[0].duplicatas;
            if (amostraDuplicatas && amostraDuplicatas.length > 0) {
                console.log('Amostra de duplicata da primeira operação:', {
                    status_recebimento: amostraDuplicatas[0].status_recebimento,
                    valor: amostraDuplicatas[0].valor_bruto
                });
            }
        }

        operacoes.forEach(op => {
            // --- CORREÇÃO DA LÓGICA DE SOMA ---
            // Antes filtrava só 'Aprovada'. Agora aceitamos qualquer coisa que NÃO seja rejeitada/cancelada.
            // Isso inclui: 'Pendente', 'Liquidada', 'Pago', 'Aprovada', etc.
            
            const valorRealAprovado = op.duplicatas
                .filter(d => {
                    const status = d.status_recebimento || '';
                    // Lista de status que NÃO devem somar
                    const invalidos = ['Rejeitada', 'Cancelada', 'Excluida', 'Estornada'];
                    return !invalidos.includes(status); 
                })
                .reduce((acc, d) => acc + Number(d.valor_bruto || 0), 0);

            if (valorRealAprovado > 0) {
                const mesKey = op.data_operacao.substring(0, 7); // YYYY-MM
                if (!volumePorMes[mesKey]) {
                    volumePorMes[mesKey] = 0;
                }
                volumePorMes[mesKey] += valorRealAprovado;
            }
        });

        // Formata para o gráfico
        const resultData = Object.entries(volumePorMes).map(([mes, total]) => ({
            mes: `${mes}-01`,
            total: Number(total.toFixed(2))
        })).sort((a, b) => new Date(a.mes) - new Date(b.mes));

        console.log('Dados retornados para o gráfico:', resultData);

        return NextResponse.json(resultData, { status: 200 });

    } catch (error) {
        console.error("Erro API Volume Operado (Catch):", error);
        return NextResponse.json({ message: error.message || 'Erro interno' }, { status: 500 });
    }
}