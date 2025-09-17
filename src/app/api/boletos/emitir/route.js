import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';

// Importe os serviços dos bancos
import { getSafraAccessToken, registrarBoletoSafra } from '@/app/lib/safraService';
// Assumindo que você tenha um bradescoService similar
import { getBradescoAccessToken, registrarBoleto } from '@/app/lib/bradescoService';

export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        jwt.verify(token, process.env.JWT_SECRET);

        const { duplicataId, banco } = await request.json();

        // 1. Obter dados formatados para o banco
        const dadosResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL}/api/dados-boleto/${banco}/${duplicataId}`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!dadosResponse.ok) {
            const error = await dadosResponse.json();
            throw new Error(error.message || `Falha ao buscar dados do boleto para o banco ${banco}.`);
        }
        const dadosParaBoleto = await dadosResponse.json();

        // 2. Registrar no banco selecionado
        let boletoGerado;
        if (banco === 'safra') {
            const tokenData = await getSafraAccessToken();
            boletoGerado = await registrarBoletoSafra(tokenData.access_token, dadosParaBoleto);
        } else if (banco === 'bradesco') {
            const tokenData = await getBradescoAccessToken();
            boletoGerado = await registrarBoleto(tokenData.access_token, dadosParaBoleto);
        } else {
            throw new Error("Banco selecionado inválido.");
        }
        
        const linhaDigitavel = boletoGerado.data?.codigoBarras || boletoGerado.linhaDigitavel || 'N/A';

        // 3. Atualizar a duplicata no nosso banco de dados
        const { error: updateError } = await supabase
            .from('duplicatas')
            .update({ 
                linha_digitavel: linhaDigitavel,
                banco_emissor_boleto: banco 
            })
            .eq('id', duplicataId);

        if (updateError) {
            console.error("Erro ao salvar linha digitável no DB:", updateError);
            // Mesmo com erro aqui, o boleto foi gerado, então retornamos sucesso com um aviso.
            return NextResponse.json({ success: true, linhaDigitavel, warning: "Boleto emitido, mas falha ao salvar no banco de dados local." });
        }

        return NextResponse.json({ success: true, linhaDigitavel });

    } catch (error) {
        console.error(`Erro na API de emissão de boleto: ${error.message}`);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}