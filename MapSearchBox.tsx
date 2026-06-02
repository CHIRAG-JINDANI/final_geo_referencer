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
            // Free Nominatim OpenStreetMap API
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
        // Fast fly to the location
        map.flyTo([parseFloat(lat), parseFloat(lon)], 15, {
            duration: 0.8, // 0.8 seconds (fast but still visually smooth)
        });

        // Immediately clear the dropdown and input to keep the screen clean
        setResults([]);
        setQuery('');
    };

    return (
        <div className="absolute top-4 left-1/2 transform -translate-x-1/2 z-[1000] w-full max-w-md px-4">
            {/* Search Bar Container */}
            <div className="relative flex items-center bg-white rounded-full shadow-lg overflow-hidden border border-gray-200">
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search for a location..."
                    className="w-full py-3 pl-6 pr-12 text-sm text-gray-700 outline-none placeholder-gray-400 bg-transparent"
                />

                {/* Search Icon / Button */}
                <button
                    onClick={performSearch}
                    disabled={isSearching}
                    className="absolute right-2 p-2 bg-transparent text-gray-500 hover:text-blue-600 transition-colors"
                >
                    {isSearching ? (
                        <div className="w-5 h-5 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                    )}
                </button>
            </div>

            {/* Results Dropdown */}
            {results.length > 0 && (
                <div className="absolute top-full mt-2 w-full max-w-md bg-white rounded-xl shadow-2xl border border-gray-100 overflow-hidden z-[1001]">
                    <ul className="max-h-60 overflow-y-auto">
                        {results.map((result: any, index: number) => (
                            <li
                                key={index}
                                onClick={() => handleSelectLocation(result.lat, result.lon)}
                                className="px-4 py-3 border-b border-gray-50 last:border-0 hover:bg-blue-50 cursor-pointer transition-colors text-sm text-gray-700"
                            >
                                {result.display_name}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
}