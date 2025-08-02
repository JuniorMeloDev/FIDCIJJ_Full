'use client';

import { useState } from 'react';

export default function ChangePasswordModal({ isOpen, onClose, onSave }) {
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');

    if (!isOpen) return null;

    const handleSave = () => {
        if (newPassword !== confirmPassword) {
            setError('As novas senhas não coincidem.');
            return;
        }
        if (newPassword.length < 4) {
            setError('A nova senha deve ter pelo menos 4 caracteres.');
            return;
        }
        onSave({ currentPassword, newPassword });
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
            <div className="bg-gray-800 text-white p-6 rounded-lg shadow-xl w-full max-w-md">
                <h2 className="text-xl font-bold mb-4">Alterar Senha</h2>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium">Senha Atual</label>
                        <input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md p-2"/>
                    </div>
                     <div>
                        <label className="block text-sm font-medium">Nova Senha</label>
                        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md p-2"/>
                    </div>
                     <div>
                        <label className="block text-sm font-medium">Confirmar Nova Senha</label>
                        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="mt-1 w-full bg-gray-700 border-gray-600 rounded-md p-2"/>
                    </div>
                    {error && <p className="text-sm text-red-400">{error}</p>}
                </div>
                <div className="mt-6 flex justify-end gap-2">
                    <button onClick={onClose} className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition">Cancelar</button>
                    <button onClick={handleSave} className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 transition">Salvar Nova Senha</button>
                </div>
            </div>
        </div>
    );
}