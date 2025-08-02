'use client';

export default function SessionTimeoutModal({ isOpen, onContinue, onLogout, countdown }) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-md text-white">
                <h2 className="text-xl font-bold mb-4">Sessão Expirando</h2>
                <p className="text-gray-300 mb-6">
                    Sua sessão será encerrada por inatividade em{' '}
                    <span className="font-bold text-orange-400">{countdown}</span> segundos.
                </p>
                <p className="text-gray-300 mb-6">Deseja continuar conectado?</p>
                <div className="flex justify-end gap-4">
                    <button
                        onClick={onLogout}
                        className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition"
                    >
                        Sair
                    </button>
                    <button
                        onClick={onContinue}
                        className="bg-orange-500 text-white font-semibold py-2 px-4 rounded-md hover:bg-orange-600 transition"
                    >
                        Continuar Sessão
                    </button>
                </div>
            </div>
        </div>
    );
}