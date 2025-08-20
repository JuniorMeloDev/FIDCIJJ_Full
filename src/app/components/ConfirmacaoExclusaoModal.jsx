'use client';

export default function ConfirmacaoExclusaoModal({ isOpen, onClose, onConfirm, item }) {
    if (!isOpen || !item) {
        return null;
    }

    const handleConfirm = (tipoExclusao) => {
        onConfirm(tipoExclusao);
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex justify-center items-center z-50">
            <div className="bg-gray-800 p-6 rounded-lg shadow-xl w-full max-w-lg text-white">
                <h2 className="text-xl font-bold mb-4">Confirmar Exclusão</h2>
                <p className="text-gray-300 mb-6">
                    Você selecionou a duplicata <span className="font-semibold text-orange-400">{item.nfCte}</span> da operação <span className="font-semibold text-orange-400">#{item.operacaoId}</span>.
                </p>
                <p className="text-gray-300 mb-6">
                    O que você gostaria de excluir?
                </p>
                <div className="flex flex-col space-y-4">
                    <button
                        onClick={() => handleConfirm('duplicata')}
                        className="w-full bg-yellow-600 text-white font-semibold py-3 px-4 rounded-md hover:bg-yellow-700 transition"
                    >
                        Excluir Apenas Esta Duplicata/Parcela
                    </button>
                    <button
                        onClick={() => handleConfirm('operacao')}
                        className="w-full bg-red-600 text-white font-semibold py-3 px-4 rounded-md hover:bg-red-700 transition"
                    >
                        Excluir a Operação Inteira (Nº {item.operacaoId})
                    </button>
                </div>
                <div className="mt-6 flex justify-end">
                    <button
                        onClick={onClose}
                        className="bg-gray-600 text-gray-100 font-semibold py-2 px-4 rounded-md hover:bg-gray-500 transition"
                    >
                        Cancelar
                    </button>
                </div>
            </div>
        </div>
    );
}