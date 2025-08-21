const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

class LocationService {
  constructor() {
    this.userLocationsFile = path.join(__dirname, '..', 'data', 'user-locations.json');
    this.geocodeCache = new Map();
    
    // Common location patterns for parsing
    this.patterns = {
      coordinates: /^(-?\d+\.?\d*),\s*(-?\d+\.?\d*)$/,
      zipCode: /^\d{5}(-\d{4})?$/,
      cityState: /^(.+),\s*([A-Z]{2})$/i
    };
  }

  // Parse various location input formats
  parseLocationInput(input) {
    if (!input || typeof input !== 'string') {
      throw new Error('Invalid location input');
    }

    const trimmed = input.trim();

    // Check for coordinates (lat,lng)
    const coordMatch = trimmed.match(this.patterns.coordinates);
    if (coordMatch) {
      return {
        type: 'coordinates',
        latitude: parseFloat(coordMatch[1]),
        longitude: parseFloat(coordMatch[2])
      };
    }

    // Check for ZIP code
    if (this.patterns.zipCode.test(trimmed)) {
      return {
        type: 'zipcode',
        zipcode: trimmed
      };
    }

    // Check for City, State format
    const cityStateMatch = trimmed.match(this.patterns.cityState);
    if (cityStateMatch) {
      return {
        type: 'citystate',
        city: cityStateMatch[1].trim(),
        state: cityStateMatch[2].toUpperCase()
      };
    }

    // Default to general address
    return {
      type: 'address',
      address: trimmed
    };
  }

  // Geocode using OpenStreetMap Nominatim (free, no API key required)
  async geocodeAddress(address) {
    const cacheKey = address.toLowerCase();
    if (this.geocodeCache.has(cacheKey)) {
      return this.geocodeCache.get(cacheKey);
    }

    try {
      const encodedAddress = encodeURIComponent(address);
      const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodedAddress}&countrycodes=us&limit=1`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'NWS-Weather-Alerts-Slack/1.0 (contact@ramseyrescue.com)'
        }
      });

      if (!response.ok) {
        throw new Error(`Geocoding failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data || data.length === 0) {
        throw new Error('Location not found');
      }

      const result = {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon),
        displayName: data[0].display_name,
        formattedAddress: this.formatDisplayName(data[0].display_name)
      };

      // Cache the result
      this.geocodeCache.set(cacheKey, result);
      
      return result;
    } catch (error) {
      console.error('Geocoding error:', error);
      throw new Error(`Could not find location: ${address}`);
    }
  }

  // Geocode ZIP code using a simpler approach
  async geocodeZipCode(zipcode) {
    const cacheKey = `zip_${zipcode}`;
    if (this.geocodeCache.has(cacheKey)) {
      return this.geocodeCache.get(cacheKey);
    }

    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&postalcode=${zipcode}&countrycodes=us&limit=1`;
      
      const response = await fetch(url, {
        headers: {
          'User-Agent': 'NWS-Weather-Alerts-Slack/1.0 (contact@ramseyrescue.com)'
        }
      });

      if (!response.ok) {
        throw new Error(`ZIP code lookup failed: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data || data.length === 0) {
        throw new Error('ZIP code not found');
      }

      const result = {
        latitude: parseFloat(data[0].lat),
        longitude: parseFloat(data[0].lon),
        displayName: data[0].display_name,
        formattedAddress: this.formatDisplayName(data[0].display_name),
        zipcode: zipcode
      };

      this.geocodeCache.set(cacheKey, result);
      
      return result;
    } catch (error) {
      console.error('ZIP code geocoding error:', error);
      throw new Error(`Could not find ZIP code: ${zipcode}`);
    }
  }

  // Convert any location input to coordinates
  async getCoordinatesFromInput(input) {
    const parsed = this.parseLocationInput(input);
    
    switch (parsed.type) {
      case 'coordinates':
        return {
          latitude: parsed.latitude,
          longitude: parsed.longitude,
          displayName: `${parsed.latitude}, ${parsed.longitude}`,
          formattedAddress: `${parsed.latitude}, ${parsed.longitude}`
        };
        
      case 'zipcode':
        return await this.geocodeZipCode(parsed.zipcode);
        
      case 'citystate':
        return await this.geocodeAddress(`${parsed.city}, ${parsed.state}, USA`);
        
      case 'address':
        return await this.geocodeAddress(parsed.address);
        
      default:
        throw new Error('Unable to parse location input');
    }
  }

  // Format display name for better readability
  formatDisplayName(displayName) {
    // Remove country and clean up the display name
    const parts = displayName.split(',').map(part => part.trim());
    
    // Remove "United States" or "United States of America"
    const filtered = parts.filter(part => 
      !part.includes('United States') && 
      !part.includes('USA')
    );
    
    // Take up to 3 most relevant parts
    return filtered.slice(0, 3).join(', ');
  }

  // Load user locations from file
  async loadUserLocations() {
    try {
      const data = await fs.readFile(this.userLocationsFile, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // File doesn't exist, return empty object
      return {};
    }
  }

  // Save user locations to file
  async saveUserLocations(locations) {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.userLocationsFile);
      await fs.mkdir(dataDir, { recursive: true });
      
      await fs.writeFile(this.userLocationsFile, JSON.stringify(locations, null, 2));
    } catch (error) {
      console.error('Error saving user locations:', error);
      throw error;
    }
  }

  // Get user's saved locations
  async getUserLocations(userId) {
    const allLocations = await this.loadUserLocations();
    return allLocations[userId] || [];
  }

  // Save a location for a user
  async saveUserLocation(userId, nickname, locationData) {
    const allLocations = await this.loadUserLocations();
    
    if (!allLocations[userId]) {
      allLocations[userId] = [];
    }

    // Remove existing location with same nickname
    allLocations[userId] = allLocations[userId].filter(loc => loc.nickname !== nickname);
    
    // Add new location
    allLocations[userId].push({
      nickname,
      ...locationData,
      savedAt: new Date().toISOString()
    });

    await this.saveUserLocations(allLocations);
  }

  // Remove a saved location for a user
  async removeUserLocation(userId, nickname) {
    const allLocations = await this.loadUserLocations();
    
    if (allLocations[userId]) {
      allLocations[userId] = allLocations[userId].filter(loc => loc.nickname !== nickname);
      await this.saveUserLocations(allLocations);
    }
  }

  // Find a user's saved location by nickname
  async findUserLocation(userId, nickname) {
    const userLocations = await this.getUserLocations(userId);
    return userLocations.find(loc => loc.nickname.toLowerCase() === nickname.toLowerCase());
  }

  // Validate coordinates
  validateCoordinates(latitude, longitude) {
    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);
    
    if (isNaN(lat) || isNaN(lng)) {
      throw new Error('Invalid coordinates: must be numbers');
    }
    
    if (lat < -90 || lat > 90) {
      throw new Error('Invalid latitude: must be between -90 and 90');
    }
    
    if (lng < -180 || lng > 180) {
      throw new Error('Invalid longitude: must be between -180 and 180');
    }
    
    return { latitude: lat, longitude: lng };
  }
}

module.exports = { LocationService };