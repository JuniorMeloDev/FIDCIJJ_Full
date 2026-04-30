'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const DropdownPortal = ({
  suggestions,
  onSuggestionClick,
  inputRef,
  highlightedIndex,
  onHighlight,
  listClassName = '',
}) => {
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
  }, [suggestions, inputRef]);

  useEffect(() => {
    if (highlightedIndex < 0 || !suggestions[highlightedIndex]) return;

    const option = document.getElementById(`autocomplete-option-${suggestions[highlightedIndex].id}`);
    option?.scrollIntoView({ block: 'nearest' });
  }, [highlightedIndex, suggestions]);

  if (suggestions.length === 0) return null;

  return createPortal(
    <ul
      style={style}
      className={
        `z-50 bg-gray-700 border border-gray-600 rounded-md max-h-40 overflow-y-auto shadow-lg ` +
        listClassName
      }
    >
      {suggestions.map((item, index) => (
        <li
          key={item.id}
          id={`autocomplete-option-${item.id}`}
          onMouseDown={(e) => {
            e.preventDefault();
            onSuggestionClick(item);
          }}
          onMouseEnter={() => onHighlight(index)}
          className={`px-3 py-2 text-sm cursor-pointer text-gray-100 flex justify-between items-center ${
            highlightedIndex === index ? 'bg-orange-600' : 'hover:bg-gray-600'
          }`}
        >
          <span>
            {item.nome}
          </span>
          {/* TAG PARA DIFERENCIAR MATRIZ E FILIAL */}
          <span className="text-xs bg-gray-500 text-gray-200 px-2 py-0.5 rounded-full">
            {item.matriz_id ? `Filial - ${item.uf}` : 'Matriz'}
          </span>
        </li>
      ))}
    </ul>,
    document.body
  );
};

export default function AutocompleteSearch({
  value,
  onChange,
  onSelect,
  fetchSuggestions,
  placeholder,
  name,
  id,
  inputClassName = '',
  listClassName = '',
}) {
  const [suggestions, setSuggestions] = useState([]);
  const [isFocused, setIsFocused] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const inputRef = useRef(null);

  const handleInputChange = async (e) => {
    const query = e.target.value;
    onChange(e);

    if (query.length > 2) {
      const results = await fetchSuggestions(query);
      const safeResults = Array.isArray(results) ? results : [];
      setSuggestions(safeResults);
      setHighlightedIndex(safeResults.length > 0 ? 0 : -1);
    } else {
      setSuggestions([]);
      setHighlightedIndex(-1);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    onSelect(suggestion);
    setSuggestions([]);
    setHighlightedIndex(-1);
  };

  const handleKeyDown = (e) => {
    if (!isFocused || suggestions.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex((current) =>
        current < suggestions.length - 1 ? current + 1 : 0
      );
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex((current) =>
        current > 0 ? current - 1 : suggestions.length - 1
      );
      return;
    }

    if (e.key === 'Enter') {
      if (highlightedIndex >= 0 && suggestions[highlightedIndex]) {
        e.preventDefault();
        handleSuggestionClick(suggestions[highlightedIndex]);
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      setSuggestions([]);
      setHighlightedIndex(-1);
    }
  };

  const baseInputClasses =
    'w-full rounded-md shadow-sm p-2 text-sm bg-gray-600 border border-gray-500 ' +
    'focus:ring-orange-500 focus:border-orange-500 outline-none';

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        id={id}
        name={name}
        placeholder={placeholder}
        value={value || ''}
        onChange={handleInputChange}
        onFocus={() => setIsFocused(true)}
        onBlur={() => {
          setIsFocused(false);
          setHighlightedIndex(-1);
        }}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        role="combobox"
        aria-expanded={isFocused && suggestions.length > 0}
        aria-autocomplete="list"
        aria-activedescendant={
          highlightedIndex >= 0 && suggestions[highlightedIndex]
            ? `autocomplete-option-${suggestions[highlightedIndex].id}`
            : undefined
        }
        className={`${baseInputClasses} text-gray-100 placeholder-gray-400 ${inputClassName}`}
      />
      {isFocused && suggestions.length > 0 && (
        <DropdownPortal
          suggestions={suggestions}
          onSuggestionClick={handleSuggestionClick}
          inputRef={inputRef}
          highlightedIndex={highlightedIndex}
          onHighlight={setHighlightedIndex}
          listClassName={listClassName}
        />
      )}
    </div>
  );
}
