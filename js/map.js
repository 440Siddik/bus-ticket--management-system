const mapContainer = document.getElementById('routeMap');
let map;
let routingControl;

window.initializeMap = function() {
    if (!map && mapContainer) {
        mapContainer.style.display = "block";
        
        map = L.map('routeMap', {
            scrollWheelZoom: false,
            dragging: !L.Browser.mobile,
            tap: !L.Browser.mobile
        }).setView([23.8103, 90.4125], 7);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);
        
        map.on('focus', () => { map.scrollWheelZoom.enable(); });
        map.on('blur', () => { map.scrollWheelZoom.disable(); });
        
        setTimeout(() => { map.invalidateSize(); }, 100);
        setTimeout(() => { map.invalidateSize(); }, 500);
    }
}

window.fetchLiveWeather = async function(lat, lon, destinationName) {
    try {
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
        const data = await res.json();
        const temp = data.current_weather.temperature;
        const wind = data.current_weather.windspeed;
        
        const weatherEl = document.getElementById('weather-info');
        if (weatherEl) {
            weatherEl.classList.remove('d-none');
            weatherEl.innerHTML = `🌤️ Current Weather in ${destinationName}: <strong>${temp}°C</strong> | Wind: ${wind} km/h`;
        }
    } catch (error) {
        console.error("Weather fetch failed, failing gracefully.", error);
    }
}

window.updateRoute = async function(startLocation, endLocation) {
    if (!map) window.initializeMap();

    try {
        const safeStart = encodeURIComponent(startLocation + ", Bangladesh");
        const safeEnd = encodeURIComponent(endLocation + ", Bangladesh");

        const startRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${safeStart}`);
        const startData = await startRes.json();
        
        const endRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${safeEnd}`);
        const endData = await endRes.json();

        if (startData.length > 0 && endData.length > 0) {
            const startCoord = L.latLng(startData[0].lat, startData[0].lon);
            const endCoord = L.latLng(endData[0].lat, endData[0].lon);
            
            window.fetchLiveWeather(endData[0].lat, endData[0].lon, endLocation);

            if (routingControl) {
                map.removeControl(routingControl);
            }

            // ==========================================
            // FIX: THE MATHEMATICAL FALLBACK ENGINE
            // If the OSRM Public Server fails, times out, or rate limits,
            // this math guarantees the UI never hangs on "Calculating..."
            // ==========================================
            const distanceEl = document.getElementById("display-distance");
            const durationEl = document.getElementById("display-duration");
            
            const directDistKm = map.distance(startCoord, endCoord) / 1000;
            const approxRoadKm = directDistKm * 1.3; // Multiply by 1.3 to account for road curves
            const approxTimeHrs = approxRoadKm / 40; // 40 km/h average bus speed in BD

            if (distanceEl) distanceEl.innerText = approxRoadKm.toFixed(1) + " (Est.)";
            if (durationEl) {
                const hrs = Math.floor(approxTimeHrs);
                const mins = Math.round((approxTimeHrs - hrs) * 60);
                durationEl.innerText = hrs > 0 ? `${hrs}h ${mins}m (Est.)` : `${mins}m (Est.)`;
            }

            // Attempt Live Real-World Routing
            routingControl = L.Routing.control({
                waypoints: [startCoord, endCoord],
                router: L.Routing.osrmv1({
                    serviceUrl: 'https://router.project-osrm.org/route/v1'
                }),
                routeWhileDragging: false,
                addWaypoints: false,
                showAlternatives: true,
                show: false,
                lineOptions: {
                    styles: [
                        {color: 'black', opacity: 0.15, weight: 9},
                        {color: 'white', opacity: 0.8, weight: 6},
                        {color: '#1dd100', opacity: 1, weight: 4}
                    ]
                },
                altLineOptions: {
                    styles: [
                        {color: 'black', opacity: 0.15, weight: 9},
                        {color: 'white', opacity: 0.8, weight: 6},
                        {color: '#a0a0a0', opacity: 1, weight: 3}
                    ]
                },
                createMarker: function(i, wp, nWps) {
                    const dotColor = i === 0 ? '#1dd100' : '#ff4d4d';
                    return L.marker(wp.latLng, {
                        icon: L.divIcon({
                            className: 'custom-map-marker',
                            html: `<div style="background-color: ${dotColor}; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.5);"></div>`,
                            iconSize: [16, 16],
                            iconAnchor: [8, 8]
                        })
                    });
                }
            }).addTo(map);

            routingControl.on('routesfound', function(e) {
                const summary = e.routes[0].summary;
                
                // If successful, overwrite the fallback math with real-world data
                if (distanceEl) distanceEl.innerText = (summary.totalDistance / 1000).toFixed(1);
                if (durationEl) {
                    const hrs = Math.floor(summary.totalTime / 3600);
                    const mins = Math.round((summary.totalTime % 3600) / 60);
                    durationEl.innerText = hrs > 0 ? `${hrs}h ${mins}m` : `${mins}m`;
                }
            });

            routingControl.on('routingerror', function(e) {
                console.warn("OSRM Public Routing API limit reached. Defaulting to Haversine Mathematical Fallback.");
            });
            
            const group = new L.featureGroup([L.marker(startCoord), L.marker(endCoord)]);
            map.fitBounds(group.getBounds(), {padding: [50, 50]});
        } else {
             const distanceEl = document.getElementById("display-distance");
             const durationEl = document.getElementById("display-duration");
             if (distanceEl) distanceEl.innerText = "N/A";
             if (durationEl) durationEl.innerText = "N/A";
        }
    } catch (error) {
        console.error("Routing error:", error);
        const distanceEl = document.getElementById("display-distance");
        const durationEl = document.getElementById("display-duration");
        if (distanceEl) distanceEl.innerText = "N/A";
        if (durationEl) durationEl.innerText = "N/A";
    }
}