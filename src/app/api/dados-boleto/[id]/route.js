// Substitua todo o conteúdo de: src/app/api/dados-boleto/[id]/route.js

import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

// Função para formatar datas para o padrão YYYYMMDD
const formatDateToBradesco = (dateString) => {
    if (!dateString) return '';
    return new Date(dateString).toISOString().slice(0, 10).replace(/-/g, '');
};

// Função para formatar valores para centavos como string
const formatValueToBradesco = (value) => {
    if (typeof value !== 'number') return '0';
    return Math.round(value * 100).toString();
};

export async function GET(request, { params }) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { id } = params; // ID da duplicata

        // 1. Busca a duplicata e a operação associada para encontrar o cedente e o sacado
        const { data: duplicata, error: dupError } = await supabase
            .from('duplicatas')
            .select('*, operacao:operacoes(cliente_id)')
            .eq('id', id)
            .single();

        if (dupError) throw new Error('Duplicata não encontrada.');

        // 2. Busca os dados completos do cedente (beneficiário) e sua conta bancária principal
        const { data: cedente, error: cedenteError } = await supabase
            .from('clientes')
            .select('*, contas_bancarias(*)')
            .eq('id', duplicata.operacao.cliente_id)
            .single();

        if (cedenteError || !cedente || cedente.contas_bancarias.length === 0) {
            throw new Error('Dados do cedente ou conta bancária não encontrados no cadastro do cliente.');
        }

        // 3. Busca os dados completos do sacado (pagador) pelo nome
        const { data: sacado, error: sacadoError } = await supabase
            .from('sacados')
            .select('*')
            .eq('nome', duplicata.cliente_sacado)
            .limit(1)
            .single();
        
        if (sacadoError || !sacado) {
            throw new Error(`Dados cadastrais completos do sacado "${duplicata.cliente_sacado}" não encontrados.`);
        }

        // 4. Monta o payload do boleto com os dados reais e formatação correta
        const payload = {
            "nuCPFCNPJ": cedente.cnpj.replace(/\D/g, ''),
            "filialCPFCNPJ": process.env.BRADESCO_FILIAL_CNPJ,
            "ctrlCPFCNPJ": process.env.BRADESCO_CTRL_CNPJ,
            "codigoUsuarioSolicitante": process.env.BRADESCO_CODIGO_USUARIO,
            "registraTitulo": {
                "idProduto": "9", // Fixo para cobrança
                "nuNegociacao": process.env.BRADESCO_CONTRATO_COBRANCA,
                "nossoNumero": duplicata.id.toString().padStart(11, '0'),
                "dtEmissaoTitulo": formatDateToBradesco(duplicata.data_operacao),
                "dtVencimentoTitulo": formatDateToBradesco(duplicata.data_vencimento),
                "valorNominalTitulo": formatValueToBradesco(duplicata.valor_bruto),
                "pagador": {
                    "nuCPFCNPJ": sacado.cnpj.replace(/\D/g, ''),
                    "nome": sacado.nome.substring(0, 40),
                    "logradouro": (sacado.endereco || 'NAO INFORMADO').substring(0, 40),
                    "nuLogradouro": "0", // Ajuste se tiver o número separado
                    "bairro": (sacado.bairro || 'NAO INFORMADO').substring(0, 15),
                    "cep": (sacado.cep || '00000000').replace(/\D/g, ''),
                    "cidade": (sacado.municipio || 'NAO INFORMADO').substring(0, 15),
                    "uf": sacado.uf || 'PE',
                }
            }
        };
        
        // Validação final antes de retornar
        if (!payload.registraTitulo.pagador.nuCPFCNPJ || !payload.registraTitulo.pagador.nome) {
            throw new Error("Dados essenciais do pagador (sacado) não puderam ser montados. Verifique o cadastro do sacado.");
        }

        return NextResponse.json(payload);

    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}