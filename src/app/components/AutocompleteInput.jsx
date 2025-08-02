'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

// O portal que renderiza a lista de sugestões
const DropdownPortal = ({ sugestoes, onSugestaoClick, inputRef }) => {
    const [style, setStyle] = useState({});

    useEffect(() => {
        if (inputRef.current) {
            const rect = inputRef.current.getBoundingClientRect();
            setStyle({
                position: 'absolute',
                top: `${rect.bottom + window.scrollY + 2}px`,
                left: `${rect.left + window.scrollX}px`,
                width: `${rect.width}px`,
            });
        }
    }, [sugestoes, inputRef]);

    if (sugestoes.length === 0) return null;

    return createPortal(
        // Estilos corrigidos para o tema escuro
        <ul style={style} className="z-50 bg-gray-600 border border-gray-500 rounded-md max-h-40 overflow-y-auto shadow-lg">
            {sugestoes.map(banco => (
                <li
                    key={banco.ispb}
                    onMouseDown={(e) => {
                        e.preventDefault();
                        onSugestaoClick(banco);
                    }}
                    // Estilos corrigidos para o tema escuro
                    className="px-3 py-2 text-sm text-gray-200 cursor-pointer hover:bg-gray-500"
                >
                    {banco.name}
                </li>
            ))}
        </ul>,
        document.body
    );
};


export default function AutocompleteInput({ value, onChange }) {
    const [sugestoes, setSugestoes] = useState([]);
    const [bancos, setBancos] = useState([]);
    const [isFocused, setIsFocused] = useState(false);
    const inputRef = useRef(null);

    // Busca a lista de bancos da API
    useEffect(() => {
        fetch('https://brasilapi.com.br/api/banks/v1')
            .then(res => res.json())
            .then(data => setBancos(data))
            .catch(error => console.error("Falha ao buscar a lista de bancos:", error));
    }, []);

    const handleInputChange = (e) => {
        const query = e.target.value;
        onChange(query);
        
        if (query.length > 0 && bancos.length > 0) {
            const filteredSugestoes = bancos.filter(banco =>
                banco && banco.name && banco.name.toLowerCase().includes(query.toLowerCase())
            );
            setSugestoes(filteredSugestoes);
        } else {
            setSugestoes([]);
        }
    };

    const handleSugestaoClick = (sugestao) => {
        onChange(sugestao.name);
        setSugestoes([]);
    };

    return (
        <div className="relative w-full">
            <input
                ref={inputRef}
                type="text"
                name="banco"
                placeholder="Banco"
                value={value || ''}
                onChange={handleInputChange}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                autoComplete="off"
                // Estilos corrigidos para o tema escuro
                className="bg-gray-700 border-gray-600 rounded-md shadow-sm p-1.5 text-sm w-full text-white"
            />
            {isFocused && sugestoes.length > 0 && (
                <DropdownPortal 
                    sugestoes={sugestoes}
                    onSugestaoClick={handleSugestaoClick}
                    inputRef={inputRef}
                />
            )}
        </div>
    );
}