class WeatherFormatter {
  constructor() {
    // Weather condition to emoji mapping
    this.weatherEmojis = {
      'sunny': '☀️',
      'clear': '☀️',
      'partly cloudy': '⛅',
      'mostly cloudy': '☁️',
      'cloudy': '☁️',
      'overcast': '☁️',
      'rain': '🌧️',
      'showers': '🌦️',
      'thunderstorms': '⛈️',
      'snow': '❄️',
      'sleet': '🌨️',
      'fog': '🌫️',
      'mist': '🌫️',
      'haze': '🌫️',
      'windy': '💨',
      'breezy': '🌬️'
    };

    // Temperature range colors for Slack
    this.tempColors = {
      extreme_cold: '#000080', // Below 0°F
      very_cold: '#0000FF',    // 0-32°F
      cold: '#4169E1',         // 33-50°F
      cool: '#87CEEB',         // 51-65°F
      mild: '#90EE90',         // 66-75°F
      warm: '#FFD700',         // 76-85°F
      hot: '#FF8C00',          // 86-95°F
      very_hot: '#FF4500',     // 96-105°F
      extreme_hot: '#8B0000'   // Above 105°F
    };
  }

  // Get weather emoji from description
  getWeatherEmoji(description) {
    if (!description) return '🌤️';
    
    const lower = description.toLowerCase();
    
    for (const [condition, emoji] of Object.entries(this.weatherEmojis)) {
      if (lower.includes(condition)) {
        return emoji;
      }
    }
    
    return '🌤️'; // Default weather emoji
  }

  // Get color based on temperature
  getTempColor(temp, unit = 'F') {
    if (!temp && temp !== 0) return '#808080';
    
    // Convert to Fahrenheit if needed
    const fahrenheit = unit === 'C' ? (temp * 9/5) + 32 : temp;
    
    if (fahrenheit < 0) return this.tempColors.extreme_cold;
    if (fahrenheit < 33) return this.tempColors.very_cold;
    if (fahrenheit < 51) return this.tempColors.cold;
    if (fahrenheit < 66) return this.tempColors.cool;
    if (fahrenheit < 76) return this.tempColors.mild;
    if (fahrenheit < 86) return this.tempColors.warm;
    if (fahrenheit < 96) return this.tempColors.hot;
    if (fahrenheit < 106) return this.tempColors.very_hot;
    return this.tempColors.extreme_hot;
  }

  // Format temperature with appropriate units and emoji
  formatTemperature(temp, unit = 'F', includeEmoji = true) {
    if (!temp && temp !== 0) return 'N/A';
    
    const rounded = Math.round(temp);
    let emoji = '';
    
    if (includeEmoji) {
      const fahrenheit = unit === 'C' ? (temp * 9/5) + 32 : temp;
      if (fahrenheit < 32) emoji = '🥶';
      else if (fahrenheit > 90) emoji = '🥵';
      else if (fahrenheit > 75) emoji = '😎';
      else emoji = '🌡️';
    }
    
    return `${emoji} ${rounded}°${unit}`;
  }

  // Format wind information
  formatWind(speed, direction) {
    if (!speed || speed === 'N/A') return '';
    
    let windText = `💨 ${speed}`;
    
    if (direction && direction !== 'N/A') {
      windText += ` from ${direction}`;
    }
    
    return windText;
  }

  // Format precipitation probability
  formatPrecipitation(prob) {
    if (!prob || !prob.value) return '';
    
    const percentage = prob.value;
    let emoji = '☔';
    
    if (percentage < 20) emoji = '🌤️';
    else if (percentage < 50) emoji = '⛅';
    else if (percentage < 80) emoji = '🌦️';
    else emoji = '☔';
    
    return `${emoji} ${percentage}% chance`;
  }

  // Format 7-day forecast as Slack blocks
  formatSevenDayForecast(forecastData) {
    const { location, forecast, currentObservation } = forecastData;
    
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `🌤️ 7-Day Forecast`,
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*📍 ${location.formattedAddress}*`
        }
      }
    ];

    // Add current conditions if available
    if (currentObservation && currentObservation.temperature) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Current:* ${this.formatTemperature(currentObservation.temperature.value, 'F')} - ${currentObservation.textDescription || 'Conditions not available'}`
        }
      });
    }

    blocks.push({ type: 'divider' });

    // Group periods by day
    const days = this.groupPeriodsByDay(forecast.periods);
    
    days.forEach((day, index) => {
      if (index >= 7) return; // Limit to 7 days
      
      const dayBlock = this.formatDayForecast(day);
      blocks.push(dayBlock);
    });

    // Add timestamp and cache info
    blocks.push(
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `🕐 Updated: ${new Date(forecast.updated).toLocaleString()} ${forecastData.fromCache ? '(cached)' : ''}`
          }
        ]
      }
    );

    return { blocks };
  }

  // Format hourly forecast as Slack blocks
  formatHourlyForecast(forecastData, hours = 24) {
    const { location, hourlyForecast, currentObservation } = forecastData;
    
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `⏰ ${hours}-Hour Forecast`,
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*📍 ${location.formattedAddress}*`
        }
      }
    ];

    // Add current conditions
    if (currentObservation && currentObservation.temperature) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Current:* ${this.formatTemperature(currentObservation.temperature.value, 'F')} - ${currentObservation.textDescription || 'Conditions not available'}`
        }
      });
    }

    blocks.push({ type: 'divider' });

    // Format hourly periods
    const periods = hourlyForecast.periods.slice(0, hours);
    const hourlyText = this.formatHourlyPeriods(periods);
    
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: hourlyText
      }
    });

    // Add timestamp
    blocks.push(
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `🕐 Updated: ${new Date(hourlyForecast.updated).toLocaleString()} ${forecastData.fromCache ? '(cached)' : ''}`
          }
        ]
      }
    );

    return { blocks };
  }

  // Format current conditions as Slack blocks
  formatCurrentConditions(conditionsData) {
    const { location, currentObservation, nearestForecast } = conditionsData;
    
    const blocks = [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `🌡️ Current Conditions`,
          emoji: true
        }
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*📍 ${location.formattedAddress}*`
        }
      },
      { type: 'divider' }
    ];

    if (currentObservation) {
      const conditionsText = this.formatCurrentObservation(currentObservation);
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: conditionsText
        }
      });
    } else {
      // Fall back to forecast data
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${nearestForecast.name}:* ${this.getWeatherEmoji(nearestForecast.shortForecast)} ${nearestForecast.shortForecast}\n*Temperature:* ${this.formatTemperature(nearestForecast.temperature, nearestForecast.temperatureUnit)}\n*Wind:* ${this.formatWind(nearestForecast.windSpeed, nearestForecast.windDirection)}`
        }
      });
    }

    // Add timestamp
    blocks.push(
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `🕐 ${conditionsData.fromCache ? 'Cached data' : 'Live data'} • ${new Date().toLocaleString()}`
          }
        ]
      }
    );

    return { blocks };
  }

  // Group forecast periods by day
  groupPeriodsByDay(periods) {
    const days = [];
    let currentDay = null;
    
    periods.forEach(period => {
      const date = new Date(period.startTime).toDateString();
      
      if (!currentDay || currentDay.date !== date) {
        currentDay = {
          date,
          periods: [period]
        };
        days.push(currentDay);
      } else {
        currentDay.periods.push(period);
      }
    });
    
    return days;
  }

  // Format a single day's forecast
  formatDayForecast(day) {
    const dayPeriods = day.periods;
    const dayName = new Date(dayPeriods[0].startTime).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
    
    let dayText = `*${dayName}*\n`;
    
    dayPeriods.forEach(period => {
      const emoji = this.getWeatherEmoji(period.shortForecast);
      const temp = this.formatTemperature(period.temperature, period.temperatureUnit, false);
      const time = period.isDaytime ? 'Day' : 'Night';
      
      dayText += `${emoji} *${time}:* ${temp} - ${period.shortForecast}\n`;
    });
    
    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: dayText.trim()
      }
    };
  }

  // Format hourly periods into compact text
  formatHourlyPeriods(periods) {
    let text = '';
    
    periods.forEach((period, index) => {
      if (index % 6 === 0 && index > 0) text += '\n';
      
      const time = new Date(period.startTime).toLocaleTimeString('en-US', { 
        hour: 'numeric', 
        hour12: true 
      });
      const emoji = this.getWeatherEmoji(period.shortForecast);
      const temp = Math.round(period.temperature);
      
      text += `${emoji}${temp}° `;
    });
    
    return text.trim();
  }

  // Format current observation data
  formatCurrentObservation(obs) {
    let text = '';
    
    if (obs.textDescription) {
      text += `${this.getWeatherEmoji(obs.textDescription)} *${obs.textDescription}*\n`;
    }
    
    if (obs.temperature) {
      text += `🌡️ *Temperature:* ${Math.round(obs.temperature.value)}°F\n`;
    }
    
    if (obs.dewpoint) {
      text += `💧 *Dewpoint:* ${Math.round(obs.dewpoint.value)}°F\n`;
    }
    
    if (obs.relativeHumidity) {
      text += `💨 *Humidity:* ${Math.round(obs.relativeHumidity.value)}%\n`;
    }
    
    if (obs.windSpeed && obs.windSpeed.value) {
      const windText = this.formatWind(`${Math.round(obs.windSpeed.value)} mph`, obs.windDirection ? `${obs.windDirection.value}°` : null);
      if (windText) text += `${windText}\n`;
    }
    
    if (obs.barometricPressure) {
      text += `📊 *Pressure:* ${obs.barometricPressure.value.toFixed(2)} inHg\n`;
    }
    
    if (obs.visibility) {
      text += `👁️ *Visibility:* ${obs.visibility.value} miles\n`;
    }
    
    return text.trim() || 'Current observation data not available';
  }

  // Create interactive forecast selection buttons
  createForecastButtons(location) {
    return [
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '7-Day Forecast',
              emoji: true
            },
            action_id: 'forecast_7day',
            value: location
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '24-Hour Hourly',
              emoji: true
            },
            action_id: 'forecast_hourly',
            value: location
          },
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Current Conditions',
              emoji: true
            },
            action_id: 'forecast_current',
            value: location
          }
        ]
      }
    ];
  }
}

module.exports = { WeatherFormatter };