import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseServerClient';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// GET: Busca todos os usuários
export async function GET(request) {
    console.log('[DEBUG] A entrar na função GET /api/users');
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) {
            console.log('[DEBUG] Token não encontrado no cabeçalho.');
            return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        console.log('[DEBUG] Token descodificado com sucesso. Cargos:', decoded.roles);

        // Verificação robusta dos cargos
        const userRoles = decoded.roles?.map(role => role.trim()) || [];
        const isAdmin = userRoles.includes('ROLE_ADMIN');
        console.log(`[DEBUG] O utilizador é admin? ${isAdmin}`);

        if (!isAdmin) {
            console.log('[DEBUG] Acesso negado. O utilizador não é ROLE_ADMIN.');
            return NextResponse.json({ message: 'Acesso negado' }, { status: 403 });
        }

        console.log('[DEBUG] Acesso concedido. A buscar utilizadores na base de dados...');
        const { data, error } = await supabase.from('users').select('id, username, email, telefone, roles');

        if (error) throw error;
        return NextResponse.json(data, { status: 200 });
    } catch (error) {
        console.error('[ERRO] Falha na função GET /api/users:', error);
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}

// POST: Cria um novo usuário
export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const userRoles = decoded.roles?.map(r => r.trim()) || [];
        if (!userRoles.includes('ROLE_ADMIN')) {
            return NextResponse.json({ message: 'Acesso negado' }, { status: 403 });
        }

        const body = await request.json();

        const { data: existingUser, error: existingUserError } = await supabase
            .from('users')
            .select('id')
            .or(`username.eq.${body.username},email.eq.${body.email}`);

        if (existingUserError) throw existingUserError;
        if (existingUser && existingUser.length > 0) {
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
                roles: 'ROLE_USER'
            })
            .select('id, username, email, telefone, roles')
            .single();

        if (error) throw error;
        return NextResponse.json(data, { status: 201 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}