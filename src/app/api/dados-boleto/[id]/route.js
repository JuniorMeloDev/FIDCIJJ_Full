// Substitua todo o conteúdo de: src/app/api/dados-boleto/[id]/route.js

import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

const formatDateToBradesco = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString + 'T12:00:00Z').toISOString().slice(0, 10).replace(/-/g, '');
};

const formatValueToBradesco = (value) => {
    if (typeof value !== 'number') return 0;
    return Math.round(value * 100);
};

export async function GET(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = params;

        const { data: duplicata, error: dupError } = await supabase
            .from('duplicatas')
            .select('*, operacao:operacoes(cliente_id)')
            .eq('id', id)
            .single();
        if (dupError) throw new Error('Duplicata não encontrada.');

        const { data: cedente, error: cedenteError } = await supabase
            .from('clientes')
            .select('*')
            .eq('id', duplicata.operacao.cliente_id)
            .single();
        if (cedenteError) {
            throw new Error('Dados do cedente não encontrados.');
        }

        const { data: sacado, error: sacadoError } = await supabase
            .from('sacados')
            .select('*')
            .eq('nome', duplicata.cliente_sacado)
            .limit(1)
            .single();
        if (sacadoError || !sacado) {
            throw new Error(`Dados cadastrais do sacado "${duplicata.cliente_sacado}" não encontrados.`);
        }
        
        const cedenteCnpjLimpo = cedente.cnpj.replace(/\D/g, '');
        
        // --- CORREÇÃO FINAL APLICADA AQUI ---
        // Monta o nuNegociacao com base nos seus dados reais do boleto
        const agenciaFormatada = process.env.BRADESCO_AGENCIA.padStart(5, '0');
        const contaFormatada = process.env.BRADESCO_CONTA.padStart(7, '0');
        const nuNegociacao = `${process.env.BRADESCO_CARTEIRA.padStart(3, '0')}${agenciaFormatada}${contaFormatada}${process.env.BRADESCO_CONTA_DV}`;
        
        const payload = {
            "filialCPFCNPJ": process.env.BRADESCO_FILIAL_CNPJ,
            "ctrlCPFCNPJ": process.env.BRADESCO_CTRL_CNPJ,
            "codigoUsuarioSolicitante": process.env.BRADESCO_CODIGO_USUARIO,
            "nuCPFCNPJ": cedenteCnpjLimpo.substring(0, 8),
            "registraTitulo": {
                "idProduto": "9",
                "nuNegociacao": nuNegociacao,
                "nossoNumero": duplicata.id.toString().padStart(11, '0'),
                "dtEmissaoTitulo": formatDateToBradesco(duplicata.data_operacao),
                "dtVencimentoTitulo": formatDateToBradesco(duplicata.data_vencimento),
                "valorNominalTitulo": formatValueToBradesco(duplicata.valor_bruto),
                "pagador": {
                    "nuCPFCNPJ": sacado.cnpj.replace(/\D/g, ''),
                    "nome": sacado.nome.substring(0, 40),
                    "logradouro": (sacado.endereco || 'NAO INFORMADO').substring(0, 40),
                    "nuLogradouro": "0",
                    "bairro": (sacado.bairro || 'NAO INFORMADO').substring(0, 15),
                    "cep": (sacado.cep || '00000000').replace(/\D/g, ''),
                    "cidade": (sacado.municipio || 'NAO INFORMADO').substring(0, 15),
                    "uf": sacado.uf || 'PE',
                },
                "especieTitulo": "DM",
                "percentualJuros": "0",
                "valorJuros": "0",
                "qtdeDiasJuros": "0",
                "percentualMulta": "0",
                "valorMulta": "0",
                "qtdeDiasMulta": "0"
            }
        };

        return NextResponse.json(payload);

    } catch (error) {
        console.error("Erro em /api/dados-boleto:", error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}