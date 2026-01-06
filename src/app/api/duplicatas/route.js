import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { searchParams } = new URL(request.url);

        // Filtros (Params)
        const sacadoFilter = searchParams.get('sacado');
        const sacadoIdFilter = searchParams.get('sacadoId');
        const statusFilter = searchParams.get('status');
        const dataOpInicio = searchParams.get('dataOpInicio');
        const dataOpFim = searchParams.get('dataOpFim');
        const dataVencInicio = searchParams.get('dataVencInicio');
        const dataVencFim = searchParams.get('dataVencFim');
        const nfCteFilter = searchParams.get('nfCte');
        const clienteIdFilter = searchParams.get('clienteId');
        const tipoOperacaoIdFilter = searchParams.get('tipoOperacaoId');
        const sortKey = searchParams.get('sort');
        const sortDirection = searchParams.get('direction') || 'DESC';

        // Inicia a query base
        // Nota: Usamos !inner em operações para garantir que os filtros na tabela relacionada funcionem corretamente
        // e filtrem as linhas da tabela principal (duplicatas).
        let query = supabase
            .from('duplicatas')
            .select(`
                *,
                operacao:operacoes!inner (
                    *,
                    cliente:clientes ( nome, ramo_de_atividade ),
                    tipo_operacao:tipos_operacao ( * )
                ),
                sacado:sacados ( id, nome, uf, matriz_id )
            `);

        // Aplica Filtro Base (Status da Operação)
        query = query.eq('operacao.status', 'Aprovada');

        // --- Aplicação dos Filtros Dinâmicos (Server-Side) ---

        // 1. Filtro de Sacado
        if (sacadoIdFilter) {
            query = query.eq('sacado_id', sacadoIdFilter);
        } else if (sacadoFilter) {
            // Filtra pelo nome gravado na duplicata (performance melhor que join)
            query = query.ilike('cliente_sacado', `%${sacadoFilter}%`);
        }

        // 2. Filtro de Status de Recebimento
        if (statusFilter && statusFilter !== 'Todos') {
            query = query.eq('status_recebimento', statusFilter);
        }

        // 3. Filtros de Data de Operação (Range)
        if (dataOpInicio) {
            query = query.gte('data_operacao', dataOpInicio);
        }
        if (dataOpFim) {
            query = query.lte('data_operacao', dataOpFim);
        }

        // 4. Filtros de Data de Vencimento (Range)
        if (dataVencInicio) {
            query = query.gte('data_vencimento', dataVencInicio);
        }
        if (dataVencFim) {
           query = query.lte('data_vencimento', dataVencFim);
        }

        // 5. Filtro de NF/CT-e
        if (nfCteFilter) {
            query = query.ilike('nf_cte', `%${nfCteFilter}%`);
        }

        // 6. Filtro de Cliente (Cedente) - Via Operação
        if (clienteIdFilter) {
            query = query.eq('operacao.cliente_id', clienteIdFilter);
        }

        // 7. Filtro de Tipo de Operação - Via Operação
        if (tipoOperacaoIdFilter) {
            query = query.eq('operacao.tipo_operacao_id', tipoOperacaoIdFilter);
        }

        // --- Ordenação e Paginação ---
        
        // Mapeamento de chaves de ordenação do frontend para colunas do banco
        const sortMap = {
            'dataOperacao': 'data_operacao',
            'nfCte': 'nf_cte',
            'valorBruto': 'valor_bruto',
            'valorJuros': 'valor_juros',
            'dataVencimento': 'data_vencimento',
            'clienteSacado': 'cliente_sacado',
            // Para colunas aninhadas (cedente), o sort padrão do SB não funciona direto simples assim em todas libs.
            // Mas vamos manter o padrão 'id' desc como secundário sempre.
        };

        const dbSortColumn = sortMap[sortKey];
        
        if (dbSortColumn) {
             query = query.order(dbSortColumn, { ascending: sortDirection === 'ASC' });
        } else {
             // Default sort
             query = query.order('id', { ascending: false });
        }

        // Aumentamos o limite para garantir retorno suficiente da busca filtrada
        // Agora o limite se aplica *ao resultado da busca*, não à base de busca.
        query = query.limit(2000);

        // Executa a query
        const { data: duplicatas, error } = await query;

        if (error) throw error;

        // Formatação do Retorno
        const formattedData = duplicatas.map(d => ({
            id: d.id,
            operacaoId: d.operacao_id,
            clienteId: d.operacao?.cliente_id,
            dataOperacao: d.data_operacao,
            nfCte: d.nf_cte,
            empresaCedente: d.operacao?.cliente?.nome || 'N/A',
            cedenteRamoAtividade: d.operacao?.cliente?.ramo_de_atividade || 'Outro',
            valorBruto: d.valor_bruto,
            valorJuros: d.valor_juros,
            clienteSacado: d.cliente_sacado,
            dataVencimento: d.data_vencimento,
            statusRecebimento: d.status_recebimento,
            dataLiquidacao: d.data_liquidacao,
            contaLiquidacao: d.conta_liquidacao,
            sacado_id: d.sacado_id,
            sacadoInfo: d.sacado,
            operacao: d.operacao,
            banco_emissor_boleto: d.banco_emissor_boleto,
        }));

        // Se houver ordenação complexa (ex: Cedente) que não foi feita no banco, 
        // fazemos em memória aqui (apenas para os X retornados).
        // Cedente é 'operacao.cliente.nome', difícil ordenar direto na query sem join explícito complexo.
        if (sortKey === 'empresaCedente') {
            formattedData.sort((a, b) => {
                 const nomeA = a.empresaCedente || '';
                 const nomeB = b.empresaCedente || '';
                 return sortDirection === 'ASC' ? nomeA.localeCompare(nomeB) : nomeB.localeCompare(nomeA);
            });
        }

        return NextResponse.json(formattedData, { status: 200 });

    } catch (error) {
        console.error('Erro ao buscar duplicatas:', error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}