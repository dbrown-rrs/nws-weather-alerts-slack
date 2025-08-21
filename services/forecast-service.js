const { NWSApiClient } = require('./nws-api-client');
const { LocationService } = require('./location-service');
const fs = require('fs').promises;
const path = require('path');

class ForecastService {
  constructor() {
    this.nwsClient = new NWSApiClient();
    this.locationService = new LocationService();
    this.cacheFile = path.join(__dirname, '..', 'data', 'weather-cache.json');
    this.cache = new Map();
    this.cacheTimeout = 30 * 60 * 1000; // 30 minutes cache
    
    this.loadCache();
  }

  // Load cache from file
  async loadCache() {
    try {
      const data = await fs.readFile(this.cacheFile, 'utf8');
      const cacheData = JSON.parse(data);
      
      // Convert back to Map and check expiration
      for (const [key, value] of Object.entries(cacheData)) {
        if (Date.now() - value.timestamp < this.cacheTimeout) {
          this.cache.set(key, value);
        }
      }
    } catch (error) {
      // Cache file doesn't exist or is corrupted, start fresh
      this.cache = new Map();
    }
  }

  // Save cache to file
  async saveCache() {
    try {
      const dataDir = path.dirname(this.cacheFile);
      await fs.mkdir(dataDir, { recursive: true });
      
      const cacheData = Object.fromEntries(this.cache);
      await fs.writeFile(this.cacheFile, JSON.stringify(cacheData, null, 2));
    } catch (error) {
      console.error('Error saving weather cache:', error);
    }
  }

  // Get cached data if valid
  getCached(key) {
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    return null;
  }

  // Set cache data
  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
    
    // Save to file periodically (don't await to avoid blocking)
    this.saveCache().catch(console.error);
  }

  // Get 7-day forecast for a location
  async getSevenDayForecast(locationInput) {
    try {
      // Get coordinates from location input
      const location = await this.locationService.getCoordinatesFromInput(locationInput);
      const cacheKey = `forecast_7day_${location.latitude}_${location.longitude}`;
      
      // Check cache first
      const cached = this.getCached(cacheKey);
      if (cached) {
        return { ...cached, location, fromCache: true };
      }

      // Get fresh data from NWS
      const weatherData = await this.nwsClient.getCompleteWeatherData(location.latitude, location.longitude);
      
      const result = {
        location,
        forecast: weatherData.forecast,
        gridPoint: weatherData.gridPoint,
        currentObservation: weatherData.currentObservation,
        fromCache: false
      };

      // Cache the result
      this.setCache(cacheKey, result);
      
      return result;
    } catch (error) {
      console.error('Error getting 7-day forecast:', error);
      throw new Error(`Unable to get forecast for "${locationInput}": ${error.message}`);
    }
  }

  // Get hourly forecast for a location
  async getHourlyForecast(locationInput, hours = 24) {
    try {
      const location = await this.locationService.getCoordinatesFromInput(locationInput);
      const cacheKey = `forecast_hourly_${location.latitude}_${location.longitude}_${hours}`;
      
      const cached = this.getCached(cacheKey);
      if (cached) {
        return { ...cached, location, fromCache: true };
      }

      const weatherData = await this.nwsClient.getCompleteWeatherData(location.latitude, location.longitude);
      
      // Limit to requested number of hours
      const limitedPeriods = weatherData.hourlyForecast.periods.slice(0, hours);
      
      const result = {
        location,
        hourlyForecast: {
          ...weatherData.hourlyForecast,
          periods: limitedPeriods
        },
        gridPoint: weatherData.gridPoint,
        currentObservation: weatherData.currentObservation,
        fromCache: false
      };

      this.setCache(cacheKey, result);
      
      return result;
    } catch (error) {
      console.error('Error getting hourly forecast:', error);
      throw new Error(`Unable to get hourly forecast for "${locationInput}": ${error.message}`);
    }
  }

  // Get current conditions for a location
  async getCurrentConditions(locationInput) {
    try {
      const location = await this.locationService.getCoordinatesFromInput(locationInput);
      const cacheKey = `current_${location.latitude}_${location.longitude}`;
      
      const cached = this.getCached(cacheKey);
      if (cached) {
        return { ...cached, location, fromCache: true };
      }

      const weatherData = await this.nwsClient.getCompleteWeatherData(location.latitude, location.longitude);
      
      const result = {
        location,
        currentObservation: weatherData.currentObservation,
        nearestForecast: weatherData.forecast.periods[0], // Current period
        gridPoint: weatherData.gridPoint,
        observationStations: weatherData.observationStations,
        fromCache: false
      };

      // Use shorter cache for current conditions (10 minutes)
      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });
      
      return result;
    } catch (error) {
      console.error('Error getting current conditions:', error);
      throw new Error(`Unable to get current conditions for "${locationInput}": ${error.message}`);
    }
  }

  // Get active alerts for a location
  async getActiveAlerts(locationInput) {
    try {
      const location = await this.locationService.getCoordinatesFromInput(locationInput);
      const cacheKey = `alerts_${location.latitude}_${location.longitude}`;
      
      // Shorter cache for alerts (5 minutes)
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
        return { ...cached.data, location, fromCache: true };
      }

      const alerts = await this.nwsClient.getActiveAlerts(location.latitude, location.longitude);
      
      const result = {
        location,
        alerts,
        alertCount: alerts.length,
        fromCache: false
      };

      this.cache.set(cacheKey, {
        data: result,
        timestamp: Date.now()
      });
      
      return result;
    } catch (error) {
      console.error('Error getting active alerts:', error);
      throw new Error(`Unable to get alerts for "${locationInput}": ${error.message}`);
    }
  }

  // Helper method to get temperature trend
  getTemperatureTrend(periods) {
    if (periods.length < 2) return null;
    
    const current = periods[0].temperature;
    const next = periods[1].temperature;
    
    if (next > current + 5) return 'rising';
    if (next < current - 5) return 'falling';
    return 'steady';
  }

  // Helper method to summarize conditions
  summarizeConditions(forecast) {
    if (!forecast || !forecast.periods || forecast.periods.length === 0) {
      return 'No forecast data available';
    }

    const current = forecast.periods[0];
    const today = forecast.periods.filter(p => p.name.toLowerCase().includes('today') || p.isDaytime);
    
    let summary = current.shortForecast;
    
    if (current.temperature) {
      summary += ` with temperatures around ${current.temperature}°${current.temperatureUnit}`;
    }
    
    if (current.windSpeed && current.windSpeed !== 'N/A') {
      summary += `, winds ${current.windSpeed}`;
      if (current.windDirection) {
        summary += ` from the ${current.windDirection}`;
      }
    }
    
    return summary;
  }

  // Clear expired cache entries
  cleanCache() {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp > this.cacheTimeout) {
        this.cache.delete(key);
      }
    }
    this.saveCache().catch(console.error);
  }

  // Get cache statistics
  getCacheStats() {
    const now = Date.now();
    let valid = 0;
    let expired = 0;
    
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp < this.cacheTimeout) {
        valid++;
      } else {
        expired++;
      }
    }
    
    return { valid, expired, total: this.cache.size };
  }
}

module.exports = { ForecastService };