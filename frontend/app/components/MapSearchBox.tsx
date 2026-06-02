import { useState } from 'react';
import { useMap } from 'react-leaflet';

export default function MapSearchBox() {
    const map = useMap(); // Hooks directly into your existing Leaflet map
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [isSearching, setIsSearching] = useState(false);

    const performSearch = async () => {
        if (!query.trim()) return;
        setIsSearching(true);

        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`
            );
            const data = await response.json();
            setResults(data);
        } catch (error) {
            console.error("Search failed", error);
        }

        setIsSearching(false);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter') {
            performSearch();
        }
    };

    const handleSelectLocation = (lat: string, lon: string) => {
        map.flyTo([parseFloat(lat), parseFloat(lon)], 15, { duration: 0.8 });
        setResults([]);
        setQuery('');
    };

    // Prevent map dragging/clicking when interacting with the search box
    const stopPropagation = (e: React.MouseEvent | React.TouchEvent) => {
        e.stopPropagation();
    };

    return (
        <div 
            style={{
                position: 'absolute',
                top: 20,
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 1000,
                width: '100%',
                maxWidth: 400,
                padding: '0 16px',
            }}
            onMouseDown={stopPropagation}
            onMouseUp={stopPropagation}
            onMouseMove={stopPropagation}
            onDoubleClick={stopPropagation}
            onWheel={stopPropagation}
            onTouchStart={stopPropagation}
        >
            {/* Search Bar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: 'white',
                borderRadius: 24, // Pill shape like Google Maps
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                padding: '0 16px',
                height: 48,
            }}>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search for a location..."
                    style={{
                        flex: 1,
                        border: 'none',
                        outline: 'none',
                        fontSize: 15,
                        backgroundColor: 'transparent',
                        color: '#333',
                        fontFamily: "'Space Grotesk', sans-serif"
                    }}
                />

                <button
                    onClick={performSearch}
                    disabled={isSearching}
                    style={{
                        background: 'transparent',
                        border: 'none',
                        cursor: isSearching ? 'default' : 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '8px 0 8px 8px',
                    }}
                >
                    {isSearching ? (
                        <div style={{
                            width: 20, height: 20,
                            border: '2px solid #ccc',
                            borderTopColor: 'transparent',
                            borderRadius: '50%',
                            animation: 'spin 1s linear infinite'
                        }} />
                    ) : (
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                    )}
                </button>
            </div>

            {/* Results Dropdown */}
            {results.length > 0 && (
                <div style={{
                    marginTop: 8,
                    backgroundColor: 'white',
                    borderRadius: 12,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                    overflow: 'hidden',
                    maxHeight: 280,
                    overflowY: 'auto',
                }}>
                    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                        {results.map((result: any, index: number) => (
                            <li
                                key={index}
                                onClick={() => handleSelectLocation(result.lat, result.lon)}
                                style={{
                                    padding: '12px 16px',
                                    borderBottom: '1px solid #f0f0f0',
                                    cursor: 'pointer',
                                    fontSize: 13,
                                    color: '#444',
                                    fontFamily: "'Space Grotesk', sans-serif",
                                    lineHeight: 1.4
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = '#f8fafc'}
                                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'white'}
                            >
                                {result.display_name}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <style>{`
                @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}
