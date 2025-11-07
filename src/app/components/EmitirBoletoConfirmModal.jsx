"use client";
import React from "react";

export default function EmitirBoletoConfirmModal({
  open,
  onClose,
  onEmitirUma,
  onEmitirTodas,
  nfNumero,
  duplicataNumero,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-6 mx-2">
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Emitir boleto</h2>

        <p className="text-gray-700 mb-2">
          Você selecionou a duplicata{" "}
          <strong>{duplicataNumero}</strong> da NF{" "}
          <strong>{nfNumero}</strong>.
        </p>

        <p className="text-gray-700 mb-4">
          Escolha uma das opções abaixo:
        </p>

        <div className="flex flex-col sm:flex-row gap-2">
          <button
            onClick={onEmitirUma}
            className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-3 rounded-md transition"
          >
            Apenas esta duplicata
          </button>

          <button
            onClick={onEmitirTodas}
            className="flex-1 bg-green-600 hover:bg-green-700 text-white font-medium py-2 px-3 rounded-md transition"
          >
            Todas da mesma NF
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full mt-4 border border-gray-300 hover:bg-gray-100 text-gray-700 font-medium py-2 px-3 rounded-md transition"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
