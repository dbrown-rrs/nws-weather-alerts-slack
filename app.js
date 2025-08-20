const { App } = require('@slack/bolt');
const { CAPParser } = require('./dist/services/capParser');
const { buildHomeView, buildAlertDetailModal, buildAddFeedModal, buildEditFeedModal } = require('./functions/home-builder');
const { formatAlertMessage, formatAlertBlocks } = require('./functions/alert-formatter');
const { getSubscriptions, addSubscription, removeSubscription, toggleSubscription, getProcessedAlerts, markAlertAsProcessed } = require('./functions/data-store');
const { isAdmin } = require('./config/admins');
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

(async () => {
  await app.start();
  console.log('⚡️ NWS Weather Alerts Slack app is running!');
  
  pollingInterval = setInterval(checkForAlerts, POLLING_INTERVAL);
  
  checkForAlerts();
})();