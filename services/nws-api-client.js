const fetch = require('node-fetch');

class NWSApiClient {
  constructor() {
    this.baseUrl = 'https://api.weather.gov';
    this.userAgent = 'NWS-Weather-Alerts-Slack/1.0 (contact@ramseyrescue.com)';
    this.defaultHeaders = {
      'User-Agent': this.userAgent,
      'Accept': 'application/geo+json'
    };
  }

  async makeRequest(endpoint, options = {}) {
    const url = `${this.baseUrl}${endpoint}`;
    const requestOptions = {
      ...options,
      headers: {
        ...this.defaultHeaders,
        ...options.headers
      }
    };

    try {
      console.log(`NWS API Request: ${url}`);
      const response = await fetch(url, requestOptions);
      
      if (!response.ok) {
        throw new Error(`NWS API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('NWS API request failed:', error);
      throw error;
    }
  }

  // Convert coordinates to NWS grid point
  async getGridPoint(latitude, longitude) {
    const endpoint = `/points/${latitude},${longitude}`;
    const data = await this.makeRequest(endpoint);
    
    if (!data.properties) {
      throw new Error('Invalid grid point response');
    }

    return {
      gridId: data.properties.gridId,
      gridX: data.properties.gridX,
      gridY: data.properties.gridY,
      forecastOffice: data.properties.cwa,
      timeZone: data.properties.timeZone,
      forecastUrl: data.properties.forecast,
      forecastHourlyUrl: data.properties.forecastHourly,
      forecastGridDataUrl: data.properties.forecastGridData,
      observationStationsUrl: data.properties.observationStations
    };
  }

  // Get forecast for a grid point
  async getForecast(gridId, gridX, gridY) {
    const endpoint = `/gridpoints/${gridId}/${gridX},${gridY}/forecast`;
    const data = await this.makeRequest(endpoint);
    
    return {
      updated: data.properties.updated,
      units: data.properties.units,
      periods: data.properties.periods.map(period => ({
        number: period.number,
        name: period.name,
        startTime: period.startTime,
        endTime: period.endTime,
        isDaytime: period.isDaytime,
        temperature: period.temperature,
        temperatureUnit: period.temperatureUnit,
        temperatureTrend: period.temperatureTrend,
        windSpeed: period.windSpeed,
        windDirection: period.windDirection,
        icon: period.icon,
        shortForecast: period.shortForecast,
        detailedForecast: period.detailedForecast
      }))
    };
  }

  // Get hourly forecast for a grid point
  async getHourlyForecast(gridId, gridX, gridY) {
    const endpoint = `/gridpoints/${gridId}/${gridX},${gridY}/forecast/hourly`;
    const data = await this.makeRequest(endpoint);
    
    return {
      updated: data.properties.updated,
      units: data.properties.units,
      periods: data.properties.periods.map(period => ({
        number: period.number,
        startTime: period.startTime,
        endTime: period.endTime,
        isDaytime: period.isDaytime,
        temperature: period.temperature,
        temperatureUnit: period.temperatureUnit,
        windSpeed: period.windSpeed,
        windDirection: period.windDirection,
        icon: period.icon,
        shortForecast: period.shortForecast,
        probabilityOfPrecipitation: period.probabilityOfPrecipitation,
        dewpoint: period.dewpoint,
        relativeHumidity: period.relativeHumidity
      }))
    };
  }

  // Get observation stations for a grid point
  async getObservationStations(gridId, gridX, gridY) {
    const endpoint = `/gridpoints/${gridId}/${gridX},${gridY}/stations`;
    const data = await this.makeRequest(endpoint);
    
    return data.features.map(feature => ({
      id: feature.properties.stationIdentifier,
      name: feature.properties.name,
      elevation: feature.properties.elevation,
      coordinates: feature.geometry.coordinates
    }));
  }

  // Get latest observation from a station
  async getLatestObservation(stationId) {
    const endpoint = `/stations/${stationId}/observations/latest`;
    const data = await this.makeRequest(endpoint);
    
    if (!data.properties) {
      return null;
    }

    const props = data.properties;
    return {
      timestamp: props.timestamp,
      textDescription: props.textDescription,
      temperature: props.temperature,
      dewpoint: props.dewpoint,
      windDirection: props.windDirection,
      windSpeed: props.windSpeed,
      windGust: props.windGust,
      barometricPressure: props.barometricPressure,
      seaLevelPressure: props.seaLevelPressure,
      visibility: props.visibility,
      maxTemperatureLast24Hours: props.maxTemperatureLast24Hours,
      minTemperatureLast24Hours: props.minTemperatureLast24Hours,
      precipitationLastHour: props.precipitationLastHour,
      precipitationLast3Hours: props.precipitationLast3Hours,
      precipitationLast6Hours: props.precipitationLast6Hours,
      relativeHumidity: props.relativeHumidity,
      windChill: props.windChill,
      heatIndex: props.heatIndex,
      cloudLayers: props.cloudLayers
    };
  }

  // Get active alerts for a point
  async getActiveAlerts(latitude, longitude) {
    const endpoint = `/alerts/active?point=${latitude},${longitude}`;
    const data = await this.makeRequest(endpoint);
    
    return data.features.map(feature => ({
      id: feature.properties.id,
      areaDesc: feature.properties.areaDesc,
      severity: feature.properties.severity,
      urgency: feature.properties.urgency,
      certainty: feature.properties.certainty,
      event: feature.properties.event,
      headline: feature.properties.headline,
      description: feature.properties.description,
      instruction: feature.properties.instruction,
      response: feature.properties.response,
      effective: feature.properties.effective,
      expires: feature.properties.expires,
      senderName: feature.properties.senderName,
      sent: feature.properties.sent
    }));
  }

  // Helper method to get complete weather data for a location
  async getCompleteWeatherData(latitude, longitude) {
    try {
      const gridPoint = await this.getGridPoint(latitude, longitude);
      const [forecast, hourlyForecast, stations] = await Promise.all([
        this.getForecast(gridPoint.gridId, gridPoint.gridX, gridPoint.gridY),
        this.getHourlyForecast(gridPoint.gridId, gridPoint.gridX, gridPoint.gridY),
        this.getObservationStations(gridPoint.gridId, gridPoint.gridX, gridPoint.gridY)
      ]);

      let currentObservation = null;
      if (stations.length > 0) {
        // Try to get observation from the first station
        try {
          currentObservation = await this.getLatestObservation(stations[0].id);
        } catch (error) {
          console.warn('Could not get current observation:', error.message);
        }
      }

      return {
        gridPoint,
        forecast,
        hourlyForecast,
        currentObservation,
        observationStations: stations
      };
    } catch (error) {
      console.error('Error getting complete weather data:', error);
      throw error;
    }
  }
}

module.exports = { NWSApiClient };