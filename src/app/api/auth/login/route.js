import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

export async function POST(request) {
    try {
        const body = await request.json();
        const { username, password } = body;

        if (!username || !password) {
            return NextResponse.json({ message: 'Usuário e senha são obrigatórios' }, { status: 400 });
        }

        const { data: user, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('username', username)
            .single();

        if (userError || !user) {
            return NextResponse.json({ message: 'Credenciais inválidas' }, { status: 401 });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return NextResponse.json({ message: 'Credenciais inválidas' }, { status: 401 });
        }

        const userRoles = user.roles.split(',').map(role => role.trim());

        const claims = {
            username: user.username,
            roles: userRoles,
            sub: user.username,
        };

        // MODIFICAÇÃO: Se for um cliente, busca o nome e adiciona o ID e nome ao token
        if (userRoles.includes('ROLE_CLIENTE') && user.cliente_id) {
            const { data: clienteData, error: clienteError } = await supabase
                .from('clientes')
                .select('nome')
                .eq('id', user.cliente_id)
                .single();
            
            if (clienteError) throw new Error('Não foi possível encontrar a empresa associada a este usuário.');

            claims.cliente_id = user.cliente_id;
            claims.cliente_nome = clienteData.nome;
        }

        const token = jwt.sign(claims, process.env.JWT_SECRET, {
            expiresIn: '10h',
        });

        return NextResponse.json({ token }, { status: 200 });

    } catch (error) {
        console.error('Erro interno no servidor:', error);
        return NextResponse.json({ message: 'Ocorreu um erro durante a autenticação' }, { status: 500 });
    }
}

