function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const toRad = (angle) => (angle * Math.PI) / 180; // Convert degrees to radians

    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distanceInKm = R * c; // Distance in kilometers
    const distanceInMeters = distanceInKm * 1000; // Convert to meters

    

    return {
        kilometers: distanceInKm.toFixed(2) + " km",
        meters: distanceInMeters.toFixed(2) + " m"
    };
}


// Example Usage:
// const lat1 = 28.7041; // Delhi
// const lon1 = 77.1025;
// const lat2 = 19.0760; // Mumbai
// const lon2 = 72.8777;

const lat1 = 28.6405152; // Delhi
const lon1 = 77.1037309;
const lat2 = 28.640466; // Mumbai
const lon2 = 77.104677;

console.log(getDistance(lat1, lon1, lat2, lon2));
