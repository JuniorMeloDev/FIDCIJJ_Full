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

        // 1. Encontra o utilizador na base de dados Supabase
        const { data: users, error: userError } = await supabase
            .from('users') // O nome da sua tabela de utilizadores
            .select('*')
            .eq('username', username)
            .single();

        if (userError || !users) {
            console.error('Erro ao buscar utilizador ou utilizador não encontrado:', userError);
            return NextResponse.json({ message: 'Credenciais inválidas' }, { status: 401 });
        }

        const user = users;

        // 2. Compara a senha enviada com a senha encriptada no banco de dados
        const isPasswordValid = await bcrypt.compare(password, user.password);

        if (!isPasswordValid) {
            return NextResponse.json({ message: 'Credenciais inválidas' }, { status: 401 });
        }

        // 3. Se a senha for válida, cria o token JWT
        const claims = {
            username: user.username,
            roles: user.roles.split(','),
            sub: user.username,
        };

        const token = jwt.sign(claims, process.env.JWT_SECRET, {
            expiresIn: '10h',
        });

        // 4. Retorna o token com sucesso
        return NextResponse.json({ token }, { status: 200 });

    } catch (error) {
        console.error('Erro interno no servidor:', error);
        return NextResponse.json({ message: 'Ocorreu um erro durante a autenticação' }, { status: 500 });
    }
}