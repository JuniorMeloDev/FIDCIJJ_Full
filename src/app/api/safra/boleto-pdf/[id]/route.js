import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import { gerarPdfBoletoSafra } from '@/app/lib/safraPdfService';

export async function GET(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = params;

        // Busca os dados da duplicata e do cedente
        const { data: duplicata, error: dupError } = await supabase
            .from('duplicatas')
            .select('*, operacao:operacoes!inner(cliente:clientes!inner(*))')
            .eq('id', id)
            .single();

        if (dupError || !duplicata) {
            throw new Error('Duplicata não encontrada.');
        }

        // Busca dados do sacado
        const { data: sacado } = await supabase
            .from('sacados')
            .select('*')
            .eq('nome', duplicata.cliente_sacado)
            .single();
        
        if (!sacado) {
            throw new Error('Sacado não encontrado.');
        }

        // Prepara o objeto com todos os dados para o PDF
        const dadosParaBoleto = {
            agencia: "12400",
            conta: "008554440",
            cedente: {
                nome: duplicata.operacao.cliente.nome,
                cnpj: duplicata.operacao.cliente.cnpj,
            },
            documento: {
                numero: duplicata.id.toString().padStart(9, '0'),
                numeroCliente: duplicata.nf_cte.substring(0, 10),
                dataVencimento: duplicata.data_vencimento,
                valor: duplicata.valor_bruto,
                pagador: {
                    nome: sacado.nome,
                    cnpj: sacado.cnpj,
                    endereco: {
                        logradouro: sacado.endereco,
                        bairro: sacado.bairro,
                        cidade: sacado.municipio,
                        uf: sacado.uf,
                        cep: sacado.cep,
                    }
                }
            }
        };

        const pdfBuffer = gerarPdfBoletoSafra(dadosParaBoleto);
        
        const headers = new Headers();
        headers.append('Content-Type', 'application/pdf');
        headers.append('Content-Disposition', `attachment; filename="boleto_${duplicata.nf_cte}.pdf"`);

        return new Response(pdfBuffer, { headers });

    } catch (error) {
        console.error("Erro ao gerar PDF do boleto Safra:", error);
        return NextResponse.json({ message: error.message || 'Erro interno do servidor' }, { status: 500 });
    }
}