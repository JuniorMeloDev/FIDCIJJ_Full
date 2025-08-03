import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseClient';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// GET: Busca todos os usuários
export async function GET(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // Apenas permite que administradores vejam a lista de usuários
        if (!decoded.roles.includes('ROLE_ADMIN')) {
            return NextResponse.json({ message: 'Acesso negado' }, { status: 403 });
        }

        const { data, error } = await supabase.from('users').select('id, username, email, telefone, roles');

        if (error) throw error;
        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

// POST: Cria um novo usuário
export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        if (!decoded.roles.includes('ROLE_ADMIN')) {
            return NextResponse.json({ message: 'Acesso negado' }, { status: 403 });
        }

        const body = await request.json();

        // Verifica se o usuário ou email já existem
        const { data: existingUser, error: existingUserError } = await supabase
            .from('users')
            .select('id')
            .or(`username.eq.${body.username},email.eq.${body.email}`);

        if (existingUserError) throw existingUserError;
        if (existingUser.length > 0) {
             return NextResponse.json({ message: 'Nome de usuário ou e-mail já existe.' }, { status: 409 });
        }

        const hashedPassword = await bcrypt.hash(body.password, 10);

        const { data, error } = await supabase
            .from('users')
            .insert({
                username: body.username,
                email: body.email,
                telefone: body.telefone,
                password: hashedPassword,
                roles: 'ROLE_USER' // Por padrão, novos usuários são 'USER'
            })
            .select('id, username, email, telefone, roles')
            .single();

        if (error) throw error;
        return NextResponse.json(data, { status: 201 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}