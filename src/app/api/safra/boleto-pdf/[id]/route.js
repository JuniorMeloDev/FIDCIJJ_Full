import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { gerarPdfBoletoSafra } from '@/app/lib/safraPdfService';

export async function GET(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        // --- CORREÇÃO APLICADA AQUI ---
        // Lendo o parâmetro correto 'id' e renomeando para 'operacaoId' para manter a consistência no resto do código.
        const { id: operacaoId } = params;

        // Busca TODAS as duplicatas da operação
        const { data: duplicatas, error: dupError } = await supabase
            .from('duplicatas')
            .select('*, operacao:operacoes!inner(cliente:clientes!inner(*))')
            .eq('operacao_id', operacaoId)
            .order('data_vencimento', { ascending: true });

        if (dupError || !duplicatas || duplicatas.length === 0) {
            throw new Error('Nenhuma duplicata encontrada para esta operação.');
        }

        const listaBoletos = [];

        for (const duplicata of duplicatas) {
            const { data: sacado } = await supabase
                .from('sacados')
                .select('*')
                .eq('nome', duplicata.cliente_sacado)
                .single();
            
            if (!sacado) continue;

            listaBoletos.push({
                agencia: "12400",
                conta: "008554440",
                cedente: duplicata.operacao.cliente,
                documento: {
                    numero: duplicata.id.toString().padStart(9, '0'),
                    numeroCliente: duplicata.nf_cte,
                    dataVencimento: duplicata.data_vencimento,
                    dataEmissao: duplicata.data_operacao,
                    valor: duplicata.valor_bruto,
                    especie: 'DM',
                    pagador: {
                        nome: sacado.nome,
                        numeroDocumento: sacado.cnpj,
                        endereco: {
                            logradouro: sacado.endereco,
                            bairro: sacado.bairro,
                            cidade: sacado.municipio,
                            uf: sacado.uf,
                            cep: sacado.cep,
                        }
                    }
                }
            });
        }
        
        const pdfBuffer = gerarPdfBoletoSafra(listaBoletos);
        
        const headers = new Headers();
        headers.append('Content-Type', 'application/pdf');
        headers.append('Content-Disposition', `attachment; filename="boletos_op_${operacaoId}.pdf"`);

        return new Response(pdfBuffer, { headers });

    } catch (error) {
        console.error("Erro ao gerar PDF do boleto Safra:", error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}