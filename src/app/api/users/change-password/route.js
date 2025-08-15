import { NextResponse } from 'next/server';
import { supabase } from '@/app/utils/supabaseServerClient';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// POST: Altera a senha do usuário logado
export async function POST(request) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ message: 'Não autorizado' }, { status: 401 });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const username = decoded.sub;

        const { currentPassword, newPassword } = await request.json();

        // Busca o usuário e sua senha atual
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, password')
            .eq('username', username)
            .single();

        if (userError) throw new Error("Usuário não encontrado.");

        const isPasswordValid = await bcrypt.compare(currentPassword, user.password);
        if (!isPasswordValid) {
            return NextResponse.json({ message: 'A senha atual está incorreta.' }, { status: 400 });
        }

        const newHashedPassword = await bcrypt.hash(newPassword, 10);

        const { error: updateError } = await supabase
            .from('users')
            .update({ password: newHashedPassword })
            .eq('id', user.id);

        if (updateError) throw updateError;

        return NextResponse.json({ message: 'Senha alterada com sucesso.' }, { status: 200 });
    } catch (error) {
        return NextResponse.json({ message: error.message }, { status: 500 });
    }
}