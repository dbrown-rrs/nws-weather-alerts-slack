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
let healthCheckInterval = null;
let lastSuccessfulCheck = Date.now();
let consecutiveFailures = 0;
let startTime = Date.now();
const maxFailures = 3;
const HEALTH_CHECK_INTERVAL = 30 * 1000; // 30 seconds

async function checkForAlerts() {
  console.log('Checking for weather alerts...');
  
  try {
    const subscriptions = await getSubscriptions();
    console.log(`Found ${subscriptions.length} subscription(s)`);
    
    if (subscriptions.length === 0) {
      console.log('No subscriptions configured - using default feeds');
    }
    
    const processedAlerts = await getProcessedAlerts();
    console.log(`Tracking ${processedAlerts.size} processed alerts`);
    
    let checkedCount = 0;
    let alertCount = 0;
    
    for (const subscription of subscriptions) {
      if (!subscription.active) {
        console.log(`Skipping inactive subscription: ${subscription.name}`);
        continue;
      }
      
      try {
        console.log(`Checking feed: ${subscription.name} (${subscription.zone})`);
        const alerts = await capParser.fetchAndParseFeed(subscription.url);
        checkedCount++;
        
        for (const alert of alerts) {
          if (!processedAlerts.has(alert.id)) {
            await postAlertToSlack(alert, subscription);
            await markAlertAsProcessed(alert.id);
            alertCount++;
          }
        }
      } catch (error) {
        console.error(`Error checking feed ${subscription.url}:`, error.message);
      }
    }
    
    console.log(`Alert check complete: checked ${checkedCount} feeds, posted ${alertCount} new alerts`);
    
    // Update health tracking
    lastSuccessfulCheck = Date.now();
    consecutiveFailures = 0;
    
  } catch (error) {
    console.error('Critical error in checkForAlerts:', error);
    console.error('Stack trace:', error.stack);
    consecutiveFailures++;
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

// Health monitoring functions
function startHealthCheck() {
  healthCheckInterval = setInterval(() => {
    performHealthCheck();
  }, HEALTH_CHECK_INTERVAL);
  
  console.log(`💓 Health monitoring started (${HEALTH_CHECK_INTERVAL/1000}s intervals)`);
}

async function performHealthCheck() {
  const now = Date.now();
  const timeSinceLastCheck = now - lastSuccessfulCheck;
  const maxAllowedDelay = POLLING_INTERVAL * 2; // Allow 2x polling interval
  
  console.log(`💓 Health check - Last successful: ${Math.round(timeSinceLastCheck/1000)}s ago, Failures: ${consecutiveFailures}`);
  
  // Check if we've had too many failures
  if (consecutiveFailures >= maxFailures) {
    console.error(`🚨 CRITICAL: ${consecutiveFailures} consecutive failures detected!`);
    await sendCriticalAlert('Multiple consecutive failures detected');
  }
  
  // Check if last successful check was too long ago  
  if (timeSinceLastCheck > maxAllowedDelay) {
    console.error(`🚨 CRITICAL: Last successful check was ${Math.round(timeSinceLastCheck/60000)} minutes ago!`);
    await sendCriticalAlert('Alert monitoring has been offline too long');
  }
  
  // Test Slack connection
  try {
    await app.client.auth.test();
    console.log('✅ Slack connection healthy');
  } catch (error) {
    console.error('❌ Slack connection failed:', error);
    consecutiveFailures++;
  }
}

async function sendCriticalAlert(reason) {
  try {
    const { ADMIN_USERS } = require('./config/admins');
    const uptime = Math.round((Date.now() - startTime) / 60000);
    
    const message = `🚨 **WEATHER ALERTS SYSTEM FAILURE** 🚨

Reason: ${reason}
Uptime: ${uptime} minutes
Time: ${new Date().toLocaleString()}

**IMMEDIATE ACTION REQUIRED**`;
    
    for (const adminId of ADMIN_USERS) {
      await app.client.chat.postMessage({
        channel: adminId,
        text: message
      });
    }
    
    // Also post to the alerts channel
    await app.client.chat.postMessage({
      channel: TARGET_CHANNEL,
      text: `🚨 **SYSTEM ALERT**: Weather monitoring system requires attention. Admins have been notified.`
    });
    
    console.log(`🚨 Critical alert sent: ${reason}`);
    
  } catch (error) {
    console.error('❌ Failed to send critical alert:', error);
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
  const startTime = Date.now();
  console.log(`[CMD /weather-locations] Received at ${new Date().toISOString()}, user: ${body.user_id}`);
  
  // Acknowledge IMMEDIATELY - this is critical for slash commands
  await ack();
  console.log(`[CMD /weather-locations] Acknowledged in ${Date.now() - startTime}ms`);
  
  try {
    console.log(`[CMD /weather-locations] Building modal (${Date.now() - startTime}ms elapsed)`);
    const modal = await locationManager.buildManageLocationsModal(body.user_id);
    
    console.log(`[CMD /weather-locations] Opening modal with trigger_id: ${body.trigger_id} (${Date.now() - startTime}ms elapsed)`);
    await client.views.open({
      trigger_id: body.trigger_id,
      view: modal
    });
    console.log(`[CMD /weather-locations] Successfully opened modal (${Date.now() - startTime}ms elapsed)`);
  } catch (error) {
    console.error(`[CMD /weather-locations] Error opening modal (${Date.now() - startTime}ms elapsed):`, error);
    
    // Check if it's specifically a trigger_id issue
    if (error.data?.error === 'expired_trigger_id') {
      console.error(`[CMD /weather-locations] Trigger ID expired after ${Date.now() - startTime}ms. This should not happen with slash commands!`);
    }
    
    await client.chat.postEphemeral({
      channel: body.channel_id,
      user: body.user_id,
      text: `❌ Error opening locations manager: ${error.message}\n\nPlease try again. If this persists, contact support.`
    });
  }
});

app.command('/weather-add-location', async ({ command, ack, client, body }) => {
  const startTime = Date.now();
  console.log(`[CMD /weather-add-location] Received at ${new Date().toISOString()}, user: ${body.user_id}`);
  
  // Acknowledge IMMEDIATELY - this is critical for slash commands
  await ack();
  console.log(`[CMD /weather-add-location] Acknowledged in ${Date.now() - startTime}ms`);
  
  try {
    console.log(`[CMD /weather-add-location] Building modal (${Date.now() - startTime}ms elapsed)`);
    const modal = locationManager.buildAddLocationModal();
    
    console.log(`[CMD /weather-add-location] Opening modal with trigger_id: ${body.trigger_id} (${Date.now() - startTime}ms elapsed)`);
    await client.views.open({
      trigger_id: body.trigger_id,
      view: modal
    });
    console.log(`[CMD /weather-add-location] Successfully opened modal (${Date.now() - startTime}ms elapsed)`);
  } catch (error) {
    console.error(`[CMD /weather-add-location] Error opening modal (${Date.now() - startTime}ms elapsed):`, error);
    
    // Check if it's specifically a trigger_id issue
    if (error.data?.error === 'expired_trigger_id') {
      console.error(`[CMD /weather-add-location] Trigger ID expired after ${Date.now() - startTime}ms. This should not happen with slash commands!`);
    }
    
    await client.chat.postEphemeral({
      channel: body.channel_id,
      user: body.user_id,
      text: `❌ Error opening add location form: ${error.message}\n\nPlease try again. If this persists, contact support.`
    });
  }
});

app.action('manage_locations', async ({ ack, body, client }) => {
  // Acknowledge immediately
  await ack();
  
  console.log(`[MANAGE_LOCATIONS] Button clicked from Home tab by ${body.user.id}`);
  
  // Home tab buttons don't have valid trigger_ids for modals
  // Send an ephemeral message with instructions instead
  try {
    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: '⚙️ *Manage Locations*\n\nTo manage your saved locations, use the slash command:\n\n`/weather-locations`\n\nThis will open a form where you can view, edit, or remove your saved locations.'
    });
  } catch (error) {
    console.error('[MANAGE_LOCATIONS] Error sending instructions:', error);
  }
});

app.action('add_location_button', async ({ ack, body, client }) => {
  // Acknowledge immediately to prevent timeout
  await ack();
  
  console.log(`[ADD_LOCATION] Button clicked from Home tab by ${body.user.id}`);
  
  // Home tab buttons don't have valid trigger_ids for modals
  // Send an ephemeral message with instructions instead
  try {
    await client.chat.postEphemeral({
      channel: body.user.id,
      user: body.user.id,
      text: '📍 *Add a Location*\n\nTo add a new location, use the slash command:\n\n`/weather-add-location`\n\nThis will open a form where you can enter your location details.'
    });
  } catch (error) {
    console.error('[ADD_LOCATION] Error sending instructions:', error);
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
  
  // Initialize data on startup
  try {
    console.log('Initializing data directory and subscriptions...');
    const subscriptions = await getSubscriptions();
    console.log(`Initialized with ${subscriptions.length} subscription(s)`);
    
    if (subscriptions.length > 0) {
      console.log('Active subscriptions:');
      subscriptions.forEach(sub => {
        console.log(`  - ${sub.name} (${sub.zone}): ${sub.active ? 'Active' : 'Inactive'}`);
      });
    }
  } catch (error) {
    console.error('Error initializing data:', error);
  }
  
  // Start polling for alerts
  pollingInterval = setInterval(checkForAlerts, POLLING_INTERVAL);
  console.log(`Alert polling started (interval: ${POLLING_INTERVAL / 1000 / 60} minutes)`);
  
  // Start health monitoring
  startHealthCheck();
  
  // Run initial check
  checkForAlerts();
})();