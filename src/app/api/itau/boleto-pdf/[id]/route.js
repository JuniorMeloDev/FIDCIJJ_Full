import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { gerarPdfBoletoItau } from '@/app/lib/itauPdfService';

export async function GET(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id: operacaoId } = params;
        if (!operacaoId) {
            return NextResponse.json({ message: 'ID da Operação é obrigatório.' }, { status: 400 });
        }
        
        // ALTERADO: A consulta agora busca a operação completa para obter as regras de juros/multa
        const { data: duplicatas, error: dupError } = await supabase
            .from('duplicatas')
            .select('*, operacao:operacoes!inner(cliente:clientes!inner(*), tipo_operacao:tipos_operacao(*))')
            .eq('operacao_id', operacaoId);

        if (dupError) throw new Error('Falha ao consultar duplicatas no banco de dados.');
        if (!duplicatas || duplicatas.length === 0) throw new Error(`Nenhuma duplicata encontrada para a operação #${operacaoId}.`);

        const listaBoletos = [];
        for (const duplicata of duplicatas) {
            if (!duplicata.operacao?.cliente || !duplicata.sacado_id) continue;
            
            const { data: sacado } = await supabase.from('sacados').select('*').eq('id', duplicata.sacado_id).single();
            if (!sacado) continue;

            // ALTERADO: Simplificado para passar apenas os dados brutos. O `boletoInfo` foi removido.
            listaBoletos.push({
                ...duplicata, // Contém valor_bruto, data_vencimento, etc.
                cedente: duplicata.operacao.cliente,
                sacado: sacado,
                agencia: '0550', 
                conta: '99359-6', 
                carteira: '109', 
                nosso_numero: duplicata.id.toString().padStart(8, '0'),
                operacao: duplicata.operacao // Passa o objeto completo da operação
            });
        }
        
        if (listaBoletos.length === 0) throw new Error("Não foi possível montar os dados para nenhum boleto da operação.");

        const pdfBuffer = gerarPdfBoletoItau(listaBoletos);
        
        const tipoDocumento = duplicatas[0]?.operacao?.cliente?.ramo_de_atividade === 'Transportes' ? 'CTe' : 'NF';
        const numerosDocumento = [...new Set(duplicatas.map(d => d.nf_cte.split('.')[0]))].join('_');
        const filename = `Boletos ${tipoDocumento} ${numerosDocumento}.pdf`;
        
        const headers = new Headers();
        headers.append('Content-Type', 'application/pdf');
        headers.append('Content-Disposition', `attachment; filename="${filename}"`);

        return new Response(pdfBuffer, { headers });

    } catch (error) {
        console.error("Erro ao gerar PDF do boleto Itaú:", error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}