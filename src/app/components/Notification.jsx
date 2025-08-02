'use client';

export default function Notification({ message, type, onClose }) {
    if (!message) return null;

    const baseClasses = "fixed top-5 right-5 p-4 rounded-lg shadow-lg text-white flex justify-between items-center z-50";
    
    const typeClasses = {
        success: "bg-green-500",
        error: "bg-red-500",
    };

    return (
        <div className={`${baseClasses} ${typeClasses[type] || 'bg-gray-500'}`}>
            <span>{message}</span>
            <button onClick={onClose} className="ml-4 font-bold text-lg leading-none">&times;</button>
        </div>
    );
}