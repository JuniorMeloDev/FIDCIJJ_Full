'use client';

export default function Pagination({ totalItems, itemsPerPage, currentPage, onPageChange }) {
    const totalPages = Math.ceil(totalItems / itemsPerPage);
    if (totalPages <= 1) return null;

    const getPageNumbers = () => {
        const pageNumbers = [];
        const maxPagesToShow = 5; // Máximo de botões de página a serem exibidos
        const halfPages = Math.floor(maxPagesToShow / 2);

        if (totalPages <= maxPagesToShow) {
            for (let i = 1; i <= totalPages; i++) {
                pageNumbers.push(i);
            }
        } else {
            let startPage = Math.max(1, currentPage - halfPages);
            let endPage = Math.min(totalPages, currentPage + halfPages);

            if (currentPage - halfPages < 1) {
                endPage = maxPagesToShow;
            }
            if (currentPage + halfPages > totalPages) {
                startPage = totalPages - maxPagesToShow + 1;
            }
            
            if (startPage > 1) {
                pageNumbers.push(1);
                if (startPage > 2) {
                    pageNumbers.push('...');
                }
            }

            for (let i = startPage; i <= endPage; i++) {
                pageNumbers.push(i);
            }

            if (endPage < totalPages) {
                if (endPage < totalPages - 1) {
                    pageNumbers.push('...');
                }
                pageNumbers.push(totalPages);
            }
        }
        return pageNumbers;
    };
    
    const pageNumbers = getPageNumbers();

    return (
        <div className="mt-6 flex items-center justify-between text-gray-400">
            <div className="text-sm">
                A mostrar <span className="font-medium text-gray-200">{(currentPage - 1) * itemsPerPage + 1}</span> a <span className="font-medium text-gray-200">{Math.min(currentPage * itemsPerPage, totalItems)}</span> de <span className="font-medium text-gray-200">{totalItems}</span> resultados
            </div>
            <nav className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px" aria-label="Pagination">
                <button
                    onClick={() => onPageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                    className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-600 bg-gray-800 text-sm font-medium text-gray-300 hover:bg-gray-700 disabled:opacity-50"
                >
                    Anterior
                </button>
                {pageNumbers.map((number, index) => 
                    number === '...' ? (
                        <span key={`ellipsis-${index}`} className="relative inline-flex items-center px-4 py-2 border border-gray-600 bg-gray-800 text-sm font-medium text-gray-300">
                            ...
                        </span>
                    ) : (
                        <button
                            key={number}
                            onClick={() => onPageChange(number)}
                            className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${currentPage === number ? 'z-10 bg-orange-500 border-orange-500 text-white' : 'bg-gray-800 border-gray-600 text-gray-300 hover:bg-gray-700'}`}
                        >
                            {number}
                        </button>
                    )
                )}
                <button
                    onClick={() => onPageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                    className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-600 bg-gray-800 text-sm font-medium text-gray-300 hover:bg-gray-700 disabled:opacity-50"
                >
                    Próximo
                </button>
            </nav>
        </div>
    );
}