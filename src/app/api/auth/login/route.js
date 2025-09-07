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

        let user;
        const cleanInput = username.replace(/\D/g, '');
        const isCnpjOrCpf = cleanInput.length === 11 || cleanInput.length === 14;

        const { data: userByUsername } = await supabase
            .from('users')
            .select('*, cliente:clientes(cnpj, nome)')
            .eq('username', username)
            .single();

        if (userByUsername) {
            user = userByUsername;
        } else if (isCnpjOrCpf) {
            const { data: cliente } = await supabase
                .from('clientes')
                .select('id')
                .eq('cnpj', cleanInput)
                .single();

            if (cliente) {
                const { data: userByCliente } = await supabase
                    .from('users')
                    .select('*, cliente:clientes(cnpj, nome)')
                    .eq('cliente_id', cliente.id)
                    .single();
                
                if (userByCliente) {
                    user = userByCliente;
                }
            }
        }

        if (!user) {
            return NextResponse.json({ message: 'Credenciais inválidas' }, { status: 401 });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return NextResponse.json({ message: 'Credenciais inválidas' }, { status: 401 });
        }

        const userRoles = user.roles.split(',').map(role => role.trim());

        // --- CORREÇÃO PRINCIPAL ---
        // Adiciona o user.id diretamente no token.
        const claims = {
            user_id: user.id, // <<-- ADICIONADO AQUI
            username: user.username,
            roles: userRoles,
            sub: user.username,
        };
        
        if (userRoles.includes('ROLE_CLIENTE') && user.cliente_id) {
            claims.cliente_id = user.cliente_id;
            claims.cliente_nome = user.cliente.nome;
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
