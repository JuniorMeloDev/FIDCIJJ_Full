// Substitua todo o conteúdo de: src/app/api/dados-boleto/[id]/route.js

import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

// Função para formatar datas para o padrão YYYYMMDD
const formatDateToBradesco = (dateString) => {
    if (!dateString) return '';
    // Adiciona T12:00:00Z para tratar corretamente o fuso horário e evitar erros de dia
    return new Date(dateString + 'T12:00:00Z').toISOString().slice(0, 10).replace(/-/g, '');
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

        // 1. Busca a duplicata para obter o ID do cliente (cedente)
        const { data: duplicata, error: dupError } = await supabase
            .from('duplicatas')
            .select('*, operacao:operacoes(cliente_id)')
            .eq('id', id)
            .single();

        if (dupError) throw new Error('Duplicata não encontrada.');

        // 2. Busca os dados do cedente E SUAS CONTAS BANCÁRIAS CADASTRADAS
        const { data: cedente, error: cedenteError } = await supabase
            .from('clientes')
            .select('*, contas_bancarias(*)')
            .eq('id', duplicata.operacao.cliente_id)
            .single();

        // Valida se o cedente foi encontrado e se ele tem pelo menos uma conta cadastrada
        if (cedenteError || !cedente || !cedente.contas_bancarias || cedente.contas_bancarias.length === 0) {
            throw new Error('Dados do cedente ou conta bancária não encontrados no cadastro do cliente.');
        }
        
        // Pega a primeira conta bancária cadastrada para o cliente
        const contaPrincipal = cedente.contas_bancarias[0];
        const agenciaFormatada = contaPrincipal.agencia.replace(/\D/g, '').padStart(5, '0');
        const contaFormatada = contaPrincipal.conta_corrente.replace(/\D/g, '').padStart(8, '0');

        // 3. Busca os dados do sacado (pagador)
        const { data: sacado, error: sacadoError } = await supabase
            .from('sacados')
            .select('*')
            .eq('nome', duplicata.cliente_sacado)
            .limit(1)
            .single();
        
        if (sacadoError || !sacado) {
            throw new Error(`Dados cadastrais do sacado "${duplicata.cliente_sacado}" não encontrados.`);
        }

        // 4. MONTAGEM DINÂMICA DO PAYLOAD
        const nuNegociacao = `${process.env.BRADESCO_CARTEIRA}${agenciaFormatada}${contaFormatada}`;
        const nossoNumero = duplicata.id.toString().padStart(11, '0');

        const payload = {
            "nuCPFCNPJ": cedente.cnpj.replace(/\D/g, ''),
            "filialCPFCNPJ": process.env.BRADESCO_FILIAL_CNPJ,
            "ctrlCPFCNPJ": process.env.BRADESCO_CTRL_CNPJ,
            "codigoUsuarioSolicitante": process.env.BRADESCO_CODIGO_USUARIO,
            "registraTitulo": {
                "idProduto": "9",
                "nuNegociacao": nuNegociacao, // <-- DADO DINÂMICO DO SEU BANCO DE DADOS
                "nossoNumero": nossoNumero,
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
                "especieTitulo": "DM"
            }
        };

        return NextResponse.json(payload);

    } catch (error) {
        console.error("Erro em /api/dados-boleto:", error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}