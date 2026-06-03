import { useState, useEffect } from 'react';
import { useMap } from 'react-leaflet';

// 1. Add this interface near the top, right under your imports:
interface PhotonFeature {
    geometry: {
        coordinates: [number, number]; // [lon, lat]
    };
    properties: {
        name: string;
        city?: string;
        state?: string;
        country?: string;
    };
}

export default function MapSearchBox() {
    const map = useMap();
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<PhotonFeature[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);

    // Auto-search as you type with a 300ms delay (Debounce)
    useEffect(() => {
        if (!query.trim()) {
            setResults([]);
            setShowDropdown(false);
            return;
        }

        const delayDebounceFn = setTimeout(async () => {
            setIsSearching(true);
            try {
                // Using Photon (Komoot) API for faster, typo-tolerant search
                const response = await fetch(
                    `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=6`
                );
                const data = await response.json();
                setResults(data.features || []);
                setShowDropdown(true);
            } catch (error) {
                console.error("Search failed", error);
            } finally {
                setIsSearching(false);
            }
        }, 300);

        return () => clearTimeout(delayDebounceFn);
    }, [query]);

    const handleSelectLocation = (lon: number, lat: number) => {
        map.flyTo([lat, lon], 15, { duration: 0.8 });
        setResults([]);
        setQuery('');
        setShowDropdown(false);
    };

    // Format the display string nicely since Photon splits data into properties
    const formatAddress = (properties: PhotonFeature['properties']) => {
        const parts = [properties.name, properties.city, properties.state, properties.country];
        return parts.filter(Boolean).join(', ');
    }; // <--- THIS WAS THE MISSING BRACE

    const stopPropagation = (e: React.MouseEvent | React.TouchEvent | React.WheelEvent | React.KeyboardEvent) => {
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
            onKeyDown={stopPropagation}
        >
            {/* Search Bar */}
            <div style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: 'white',
                borderRadius: 24,
                boxShadow: '0 2px 6px rgba(0,0,0,0.2)',
                padding: '0 16px',
                height: 48,
            }}>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
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

                <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '8px 0 8px 8px',
                }}>
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
                </div>
            </div>

            {/* Results Dropdown */}
            {showDropdown && results.length > 0 && (
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
                        {results.map((result: PhotonFeature, index: number) => {
                            // Photon returns coordinates as [longitude, latitude]
                            const [lon, lat] = result.geometry.coordinates;
                            return (
                                <li
                                    key={index}
                                    onClick={() => handleSelectLocation(lon, lat)}
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
                                    <strong>{result.properties.name}</strong>
                                    {result.properties.city || result.properties.state ? (
                                        <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>
                                            {formatAddress(result.properties).replace(`${result.properties.name}, `, '')}
                                        </div>
                                    ) : null}
                                </li>
                            )
                        })}
                    </ul>
                </div>
            )}
            <style>{`
                @keyframes spin { 100% { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}