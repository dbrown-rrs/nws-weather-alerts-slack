const { LocationService } = require('../services/location-service');

class LocationManager {
  constructor() {
    this.locationService = new LocationService();
  }

  // Build modal for adding a location
  buildAddLocationModal() {
    return {
      type: 'modal',
      callback_id: 'add_location_modal',
      title: {
        type: 'plain_text',
        text: 'Add Location'
      },
      submit: {
        type: 'plain_text',
        text: 'Save Location'
      },
      close: {
        type: 'plain_text',
        text: 'Cancel'
      },
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'Save a location for quick weather access. You can use addresses, ZIP codes, or coordinates.'
          }
        },
        {
          type: 'input',
          block_id: 'location_nickname',
          element: {
            type: 'plain_text_input',
            action_id: 'nickname_input',
            placeholder: {
              type: 'plain_text',
              text: 'e.g., Home, Work, Cabin'
            }
          },
          label: {
            type: 'plain_text',
            text: 'Nickname for this location'
          }
        },
        {
          type: 'input',
          block_id: 'location_address',
          element: {
            type: 'plain_text_input',
            action_id: 'address_input',
            placeholder: {
              type: 'plain_text',
              text: 'e.g., Ramsey, NJ or 07446 or 41.06,-74.14'
            }
          },
          label: {
            type: 'plain_text',
            text: 'Location (address, ZIP, or coordinates)'
          }
        }
      ]
    };
  }

  // Build modal for managing saved locations
  async buildManageLocationsModal(userId) {
    const userLocations = await this.locationService.getUserLocations(userId);
    
    const blocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*📍 Your Saved Locations*'
        }
      }
    ];

    if (userLocations.length === 0) {
      blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: 'You haven\'t saved any locations yet. Use the "Add Location" button below to get started.'
        }
      });
    } else {
      userLocations.forEach(location => {
        blocks.push({
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*${location.nickname}*\n${location.formattedAddress}\n_Saved: ${new Date(location.savedAt).toLocaleDateString()}_`
          },
          accessory: {
            type: 'overflow',
            action_id: 'location_menu',
            options: [
              {
                text: {
                  type: 'plain_text',
                  text: '🌤️ Get Forecast'
                },
                value: `forecast_${location.nickname}`
              },
              {
                text: {
                  type: 'plain_text',
                  text: '🌡️ Current Conditions'
                },
                value: `current_${location.nickname}`
              },
              {
                text: {
                  type: 'plain_text',
                  text: '🗑️ Remove'
                },
                value: `remove_${location.nickname}`
              }
            ]
          }
        });
      });
    }

    blocks.push(
      {
        type: 'divider'
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: '➕ Add Location'
            },
            action_id: 'add_location_button',
            style: 'primary'
          }
        ]
      }
    );

    return {
      type: 'modal',
      callback_id: 'manage_locations_modal',
      title: {
        type: 'plain_text',
        text: 'Manage Locations'
      },
      close: {
        type: 'plain_text',
        text: 'Close'
      },
      blocks
    };
  }

  // Build location selection dropdown for quick access
  async buildLocationSelect(userId, actionId = 'location_select') {
    const userLocations = await this.locationService.getUserLocations(userId);
    
    if (userLocations.length === 0) {
      return null;
    }

    const options = userLocations.map(location => ({
      text: {
        type: 'plain_text',
        text: `${location.nickname} (${location.formattedAddress})`
      },
      value: location.nickname
    }));

    return {
      type: 'static_select',
      placeholder: {
        type: 'plain_text',
        text: 'Choose a saved location'
      },
      action_id: actionId,
      options
    };
  }

  // Build forecast buttons section for home tab
  async buildQuickForecastSection(userId) {
    const userLocations = await this.locationService.getUserLocations(userId);
    
    if (userLocations.length === 0) {
      return {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*🌤️ Quick Weather Access*\n\nSave locations for quick weather access. Use `/weather-forecast [location]` to get started, or manage your saved locations below.'
        },
        accessory: {
          type: 'button',
          text: {
            type: 'plain_text',
            text: 'Manage Locations'
          },
          action_id: 'manage_locations'
        }
      };
    }

    // Show quick access buttons for saved locations
    const elements = [];
    
    // Add up to 5 locations as quick buttons
    userLocations.slice(0, 5).forEach(location => {
      elements.push({
        type: 'button',
        text: {
          type: 'plain_text',
          text: `🌤️ ${location.nickname}`
        },
        action_id: 'quick_forecast',
        value: location.nickname
      });
    });

    // Add manage button
    elements.push({
      type: 'button',
      text: {
        type: 'plain_text',
        text: '⚙️ Manage'
      },
      action_id: 'manage_locations',
      style: 'primary'
    });

    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: '*🌤️ Quick Weather Access*'
      }
    };
  }

  // Process location addition from modal
  async processAddLocation(userId, values) {
    const nickname = values.location_nickname.nickname_input.value;
    const address = values.location_address.address_input.value;

    if (!nickname || !address) {
      throw new Error('Both nickname and location are required');
    }

    // Validate and geocode the location
    const locationData = await this.locationService.getCoordinatesFromInput(address);
    
    // Save the location
    await this.locationService.saveUserLocation(userId, nickname, locationData);
    
    return {
      nickname,
      location: locationData
    };
  }

  // Get location by nickname for a user
  async getUserLocationByNickname(userId, nickname) {
    return await this.locationService.findUserLocation(userId, nickname);
  }

  // Remove a user's saved location
  async removeUserLocation(userId, nickname) {
    await this.locationService.removeUserLocation(userId, nickname);
  }

  // Get all user locations for display
  async getUserLocations(userId) {
    return await this.locationService.getUserLocations(userId);
  }

  // Build command usage help
  buildCommandHelp() {
    return {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*🌦️ Weather Commands*

• \`/weather-forecast [location]\` - Get 7-day forecast
• \`/weather-hourly [location]\` - Get 24-hour forecast  
• \`/weather-current [location]\` - Get current conditions

*Location Examples:*
• City, State: \`Ramsey, NJ\`
• ZIP Code: \`07446\`
• Coordinates: \`41.06,-74.14\`
• Address: \`123 Main St, Anywhere, NY\`

*💡 Tip:* Save frequently used locations for quick access!`
      }
    };
  }
}

module.exports = { LocationManager };