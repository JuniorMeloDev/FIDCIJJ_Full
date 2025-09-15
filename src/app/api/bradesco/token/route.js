// src/app/api/bradesco/token/route.js
import { NextResponse } from 'next/server';
import { getBradescoAccessToken } from '@/app/lib/bradescoService';

export async function GET(request) {
    try {
        const tokenData = await getBradescoAccessToken();
        return NextResponse.json(tokenData);
    } catch (error) {
        console.error("Erro ao obter token do Bradesco:", error);
        return NextResponse.json(
            { message: error.message || 'Erro interno ao comunicar com a API do Bradesco.' },
            { status: 500 }
        );
    }
}