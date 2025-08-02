'use client';

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

const DropdownPortal = ({
  suggestions,
  onSuggestionClick,
  inputRef,
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

  if (suggestions.length === 0) return null;

  return createPortal(
    <ul
      style={style}
      className={
        `z-50 bg-gray-700 border border-gray-600 rounded-md max-h-40 overflow-y-auto shadow-lg ` +
        listClassName
      }
    >
      {suggestions.map((item) => (
        <li
          key={item.id}
          onMouseDown={(e) => {
            e.preventDefault();
            onSuggestionClick(item);
          }}
          className="px-3 py-2 text-sm cursor-pointer hover:bg-gray-600 text-gray-100"
        >
          {item.nome}
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
  const inputRef = useRef(null);

  const handleInputChange = async (e) => {
    const query = e.target.value;
    onChange(e);

    if (query.length > 2) {
      const results = await fetchSuggestions(query);
      setSuggestions(results);
    } else {
      setSuggestions([]);
    }
  };

  const handleSuggestionClick = (suggestion) => {
    onSelect(suggestion);
    setSuggestions([]);
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
        onBlur={() => setIsFocused(false)}
        autoComplete="off"
        className={`${baseInputClasses} text-gray-100 placeholder-gray-400 ${inputClassName}`}
      />
      {isFocused && suggestions.length > 0 && (
        <DropdownPortal
          suggestions={suggestions}
          onSuggestionClick={handleSuggestionClick}
          inputRef={inputRef}
          listClassName={listClassName}
        />
      )}
    </div>
  );
}