const { App } = require('@slack/bolt');
const { CAPParser } = require('./dist/services/capParser');
const { buildHomeView, buildAlertDetailModal, buildAddFeedModal, buildEditFeedModal } = require('./functions/home-builder');
const { formatAlertMessage, formatAlertBlocks } = require('./functions/alert-formatter');
const { getSubscriptions, addSubscription, removeSubscription, toggleSubscription, getProcessedAlerts, markAlertAsProcessed } = require('./functions/data-store');
const { isAdmin } = require('./config/admins');
const { ForecastService } = require('./services/forecast-service');
const { WeatherFormatter } = require('./services/weather-formatter');
const { LocationManager } = require('./functions/location-manager');
require('dotenv').config();

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
});

const TARGET_CHANNEL = process.env.TARGET_CHANNEL_ID || 'C09BA83JGNS';
const POLLING_INTERVAL = (parseInt(process.env.POLLING_INTERVAL_MINUTES) || 5) * 60 * 1000;

const capParser = new CAPParser();
const forecastService = new ForecastService();
const weatherFormatter = new WeatherFormatter();
const locationManager = new LocationManager();
let pollingInterval = null;

async function checkForAlerts() {
  console.log('Checking for weather alerts...');
  const subscriptions = await getSubscriptions();
  const processedAlerts = await getProcessedAlerts();
  
  for (const subscription of subscriptions) {
    if (!subscription.active) continue;
    
    try {
      const alerts = await capParser.fetchAndParseFeed(subscription.url);
      
      for (const alert of alerts) {
        if (!processedAlerts.has(alert.id)) {
          await postAlertToSlack(alert, subscription);
          await markAlertAsProcessed(alert.id);
        }
      }
    } catch (error) {
      console.error(`Error checking feed ${subscription.url}:`, error);
    }
  }
}

async function postAlertToSlack(alert, subscription) {
  try {
    const blocks = formatAlertBlocks(alert, subscription);
    
    await app.client.chat.postMessage({
      channel: TARGET_CHANNEL,
      text: formatAlertMessage(alert),
      blocks: blocks
    });
    
    console.log(`Posted alert ${alert.id} to Slack`);
  } catch (error) {
    console.error('Error posting alert to Slack:', error);
  }
}

app.event('app_home_opened', async ({ event, client }) => {
  try {
    console.log(`App home opened by user ${event.user}`);
    
    const homeView = await buildHomeView(event.user);
    
    await client.views.publish({
      user_id: event.user,
      view: homeView
    });
  } catch (error) {
    console.error('Error handling app_home_opened:', error);
  }
});

app.action('view_alert_details', async ({ ack, body, client }) => {
  await ack();
  console.log('🔍 Alert details modal requested');
  
  try {
    const testData = {
      alert: {
        id: body.actions[0].value || 'weather_alert',
        title: 'Winter Weather Advisory for Bergen County',
        event: 'Winter Weather Advisory',
        updated: new Date().toISOString(),
        effective: new Date().toISOString(),
        expires: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        status: 'Actual',
        urgency: 'Expected',
        severity: 'Minor',
        certainty: 'Likely',
        areaDesc: 'Western Bergen; Eastern Bergen',
        summary: 'Snow expected. Total snow accumulations of 2 to 4 inches.',
        description: 'Snow will develop tonight and continue through Tuesday morning. Snow accumulations of 2 to 4 inches are expected with locally higher amounts possible. Winds will increase tonight with gusts up to 35 mph possible, especially along the coast.',
        instruction: 'Slow down and use caution while traveling. Check road conditions before departing. The latest road conditions can be obtained by calling 5 1 1.',
        link: 'https://api.weather.gov/alerts/test'
      },
      subscription: {
        name: 'Bergen County, NJ',
        zone: 'NJZ103'
      }
    };
    
    console.log('🏗️ Building modal...');
    const modal = buildAlertDetailModal(testData);
    
    console.log('🚀 Opening modal...');
    await client.views.open({
      trigger_id: body.trigger_id,
      view: modal
    });
    
    console.log('✅ Alert details modal opened successfully');
  } catch (error) {
    console.error('❌ Error opening alert details modal:', error);
    console.error('Full error:', error.stack);
  }
});

app.action('add_feed', async ({ ack, body, client }) => {
  await ack();
  
  if (!isAdmin(body.user.id)) {
    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: '❌ Only admins can add feeds. Contact an administrator for help.'
    });
    return;
  }
  
  try {
    const modal = buildAddFeedModal();
    
    await client.views.open({
      trigger_id: body.trigger_id,
      view: modal
    });
  } catch (error) {
    console.error('Error opening add feed modal:', error);
  }
});

app.view('add_feed_submission', async ({ ack, body, view, client }) => {
  await ack();
  
  if (!isAdmin(body.user.id)) {
    return;
  }
  
  try {
    const values = view.state.values;
    const url = values.feed_url.url_input.value;
    const name = values.feed_name.name_input.value;
    
    await addSubscription({
      url,
      name,
      active: true,
      addedBy: body.user.id
    });
    
    const homeView = await buildHomeView(body.user.id);
    await client.views.publish({
      user_id: body.user.id,
      view: homeView
    });
    
    await client.chat.postMessage({
      channel: body.user.id,
      text: `✅ Successfully added feed: ${name}`
    });
  } catch (error) {
    console.error('Error adding feed:', error);
  }
});

app.action('feed_menu', async ({ ack, body, client }) => {
  await ack();
  
  if (!isAdmin(body.user.id)) {
    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: '❌ Only admins can modify feeds. Contact an administrator for help.'
    });
    return;
  }
  
  try {
    const selectedOption = body.actions[0].selected_option;
    const feedId = selectedOption.value;
    const actionText = selectedOption.text.text;
    
    if (actionText.includes('Pause') || actionText.includes('Resume')) {
      await toggleSubscription(feedId);
    } else if (actionText.includes('Remove')) {
      await removeSubscription(feedId);
    }
    
    const homeView = await buildHomeView(body.user.id);
    await client.views.publish({
      user_id: body.user.id,
      view: homeView
    });
  } catch (error) {
    console.error('Error handling feed menu:', error);
  }
});

app.action('refresh_home', async ({ ack, body, client }) => {
  await ack();
  
  try {
    const homeView = await buildHomeView(body.user.id);
    await client.views.publish({
      user_id: body.user.id,
      view: homeView
    });
  } catch (error) {
    console.error('Error refreshing home view:', error);
  }
});

// Weather forecast slash commands
app.command('/weather-forecast', async ({ command, ack, respond }) => {
  await ack();
  
  try {
    const location = command.text.trim();
    if (!location) {
      await respond({
        response_type: 'ephemeral',
        text: 'Please specify a location. Example: `/weather-forecast New York, NY` or `/weather-forecast 10001`'
      });
      return;
    }

    // Send initial response
    await respond({
      response_type: 'in_channel',
      text: `🔄 Getting 7-day forecast for "${location}"...`
    });

    // Get forecast data
    const forecastData = await forecastService.getSevenDayForecast(location);
    const formatted = weatherFormatter.formatSevenDayForecast(forecastData);

    // Update with forecast
    await respond({
      response_type: 'in_channel',
      ...formatted
    });

  } catch (error) {
    console.error('Error in weather-forecast command:', error);
    await respond({
      response_type: 'ephemeral',
      text: `❌ Error getting forecast: ${error.message}`
    });
  }
});

app.command('/weather-hourly', async ({ command, ack, respond }) => {
  await ack();
  
  try {
    const location = command.text.trim();
    if (!location) {
      await respond({
        response_type: 'ephemeral',
        text: 'Please specify a location. Example: `/weather-hourly Bergen County, NJ`'
      });
      return;
    }

    await respond({
      response_type: 'in_channel',
      text: `🔄 Getting hourly forecast for "${location}"...`
    });

    const forecastData = await forecastService.getHourlyForecast(location, 24);
    const formatted = weatherFormatter.formatHourlyForecast(forecastData, 24);

    await respond({
      response_type: 'in_channel',
      ...formatted
    });

  } catch (error) {
    console.error('Error in weather-hourly command:', error);
    await respond({
      response_type: 'ephemeral',
      text: `❌ Error getting hourly forecast: ${error.message}`
    });
  }
});

app.command('/weather-current', async ({ command, ack, respond }) => {
  await ack();
  
  try {
    const location = command.text.trim();
    if (!location) {
      await respond({
        response_type: 'ephemeral',
        text: 'Please specify a location. Example: `/weather-current Ramsey, NJ`'
      });
      return;
    }

    await respond({
      response_type: 'in_channel',
      text: `🔄 Getting current conditions for "${location}"...`
    });

    const conditionsData = await forecastService.getCurrentConditions(location);
    const formatted = weatherFormatter.formatCurrentConditions(conditionsData);

    await respond({
      response_type: 'in_channel',
      ...formatted
    });

  } catch (error) {
    console.error('Error in weather-current command:', error);
    await respond({
      response_type: 'ephemeral',
      text: `❌ Error getting current conditions: ${error.message}`
    });
  }
});

// Interactive button handlers for forecast actions
app.action('forecast_7day', async ({ ack, body, respond }) => {
  await ack();
  
  try {
    const location = body.actions[0].value;
    const forecastData = await forecastService.getSevenDayForecast(location);
    const formatted = weatherFormatter.formatSevenDayForecast(forecastData);

    await respond({
      ...formatted,
      replace_original: false
    });
  } catch (error) {
    console.error('Error in forecast_7day action:', error);
    await respond({
      text: `❌ Error getting forecast: ${error.message}`,
      replace_original: false
    });
  }
});

app.action('forecast_hourly', async ({ ack, body, respond }) => {
  await ack();
  
  try {
    const location = body.actions[0].value;
    const forecastData = await forecastService.getHourlyForecast(location, 24);
    const formatted = weatherFormatter.formatHourlyForecast(forecastData, 24);

    await respond({
      ...formatted,
      replace_original: false
    });
  } catch (error) {
    console.error('Error in forecast_hourly action:', error);
    await respond({
      text: `❌ Error getting hourly forecast: ${error.message}`,
      replace_original: false
    });
  }
});

app.action('forecast_current', async ({ ack, body, respond }) => {
  await ack();
  
  try {
    const location = body.actions[0].value;
    const conditionsData = await forecastService.getCurrentConditions(location);
    const formatted = weatherFormatter.formatCurrentConditions(conditionsData);

    await respond({
      ...formatted,
      replace_original: false
    });
  } catch (error) {
    console.error('Error in forecast_current action:', error);
    await respond({
      text: `❌ Error getting current conditions: ${error.message}`,
      replace_original: false
    });
  }
});

// Location management commands and actions
app.command('/weather-locations', async ({ command, ack, client, body }) => {
  await ack();
  
  try {
    const modal = await locationManager.buildManageLocationsModal(body.user_id);
    
    await client.views.open({
      trigger_id: body.trigger_id,
      view: modal
    });
  } catch (error) {
    console.error('Error opening locations modal:', error);
    await client.chat.postEphemeral({
      channel: body.channel_id,
      user: body.user_id,
      text: `❌ Error opening locations manager: ${error.message}`
    });
  }
});

app.action('manage_locations', async ({ ack, body, client }) => {
  // Acknowledge immediately
  await ack();
  
  try {
    // Open a loading modal immediately
    const loadingModal = {
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
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: '⏳ *Loading your saved locations...*'
          }
        }
      ]
    };
    
    // Open loading modal first
    const result = await client.views.open({
      trigger_id: body.trigger_id,
      view: loadingModal
    });
    
    // Now build the real modal with data
    const modal = await locationManager.buildManageLocationsModal(body.user.id);
    
    // Update the modal with actual content
    await client.views.update({
      view_id: result.view.id,
      view: modal
    });
  } catch (error) {
    console.error('Error opening manage locations modal:', error);
  }
});

app.action('add_location_button', async ({ ack, body, client }) => {
  // Acknowledge immediately to prevent timeout
  await ack();
  
  try {
    // Build modal synchronously (it doesn't need async data)
    const modal = locationManager.buildAddLocationModal();
    
    // Open modal with the fresh trigger_id
    await client.views.open({
      trigger_id: body.trigger_id,
      view: modal
    });
  } catch (error) {
    console.error('Error opening add location modal:', error);
  }
});

app.view('add_location_modal', async ({ ack, body, view, client }) => {
  try {
    const result = await locationManager.processAddLocation(body.user.id, view.state.values);
    
    // Acknowledge with success and close modal
    await ack();
    
    // Refresh the home view to show the new location
    const homeView = await buildHomeView(body.user.id);
    await client.views.publish({
      user_id: body.user.id,
      view: homeView
    });
    
    // If manage locations modal was open, refresh it
    try {
      if (body.view.previous_view_id) {
        const updatedModal = await locationManager.buildManageLocationsModal(body.user.id);
        await client.views.update({
          view_id: body.view.previous_view_id,
          view: updatedModal
        });
      }
    } catch (updateError) {
      // Modal might not be open anymore, that's ok
      console.log('Could not update previous modal:', updateError.message);
    }
    
  } catch (error) {
    console.error('Error saving location:', error);
    // Acknowledge with error
    await ack({
      response_action: 'errors',
      errors: {
        location_address: error.message || 'Failed to save location. Please try again.'
      }
    });
  }
});

app.action('location_menu', async ({ ack, body, client, respond }) => {
  await ack();
  
  try {
    const actionValue = body.actions[0].selected_option.value;
    const [action, nickname] = actionValue.split('_', 2);
    
    if (action === 'remove') {
      await locationManager.removeUserLocation(body.user.id, nickname);
      
      await client.chat.postEphemeral({
        channel: body.channel?.id || body.user.id,
        user: body.user.id,
        text: `✅ Location "${nickname}" removed successfully.`
      });
      
      // Refresh the modal
      const updatedModal = await locationManager.buildManageLocationsModal(body.user.id);
      await client.views.update({
        view_id: body.view.id,
        view: updatedModal
      });
      
    } else if (action === 'forecast') {
      const location = await locationManager.getUserLocationByNickname(body.user.id, nickname);
      if (location) {
        const forecastData = await forecastService.getSevenDayForecast(location.formattedAddress);
        const formatted = weatherFormatter.formatSevenDayForecast(forecastData);
        
        // Open a new modal with the forecast
        const forecastModal = {
          type: 'modal',
          title: {
            type: 'plain_text',
            text: '🌤️ Weather Forecast'
          },
          close: {
            type: 'plain_text',
            text: 'Close'
          },
          blocks: formatted.blocks
        };
        
        await client.views.open({
          trigger_id: body.trigger_id,
          view: forecastModal
        });
      }
      
    } else if (action === 'current') {
      const location = await locationManager.getUserLocationByNickname(body.user.id, nickname);
      if (location) {
        const conditionsData = await forecastService.getCurrentConditions(location.formattedAddress);
        const formatted = weatherFormatter.formatCurrentConditions(conditionsData);
        
        // Open a new modal with current conditions
        const conditionsModal = {
          type: 'modal',
          title: {
            type: 'plain_text',
            text: '🌡️ Current Conditions'
          },
          close: {
            type: 'plain_text',
            text: 'Close'
          },
          blocks: formatted.blocks
        };
        
        await client.views.open({
          trigger_id: body.trigger_id,
          view: conditionsModal
        });
      }
    }
  } catch (error) {
    console.error('Error handling location menu:', error);
    await client.chat.postEphemeral({
      channel: body.channel?.id || body.user.id,
      user: body.user.id,
      text: `❌ Error: ${error.message}`
    });
  }
});

app.action('quick_forecast', async ({ ack, body, client }) => {
  await ack();
  
  try {
    const nickname = body.actions[0].value;
    const location = await locationManager.getUserLocationByNickname(body.user.id, nickname);
    
    if (!location) {
      // Show error in a modal since we can't send DMs
      await client.views.open({
        trigger_id: body.trigger_id,
        view: {
          type: 'modal',
          title: {
            type: 'plain_text',
            text: 'Error'
          },
          close: {
            type: 'plain_text',
            text: 'Close'
          },
          blocks: [{
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `❌ Location "${nickname}" not found.`
            }
          }]
        }
      });
      return;
    }
    
    const forecastData = await forecastService.getSevenDayForecast(location.formattedAddress);
    const formatted = weatherFormatter.formatSevenDayForecast(forecastData);
    
    // Open forecast in a modal
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: 'modal',
        title: {
          type: 'plain_text',
          text: '🌤️ Weather Forecast'
        },
        close: {
          type: 'plain_text',
          text: 'Close'
        },
        blocks: formatted.blocks
      }
    });
    
  } catch (error) {
    console.error('Error getting quick forecast:', error);
    // Show error in modal
    await client.views.open({
      trigger_id: body.trigger_id,
      view: {
        type: 'modal',
        title: {
          type: 'plain_text',
          text: 'Error'
        },
        close: {
          type: 'plain_text',
          text: 'Close'
        },
        blocks: [{
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `❌ Error getting forecast: ${error.message}`
          }
        }]
      }
    });
  }
});

(async () => {
  await app.start();
  console.log('⚡️ NWS Weather Alerts Slack app is running!');
  
  pollingInterval = setInterval(checkForAlerts, POLLING_INTERVAL);
  
  checkForAlerts();
})();