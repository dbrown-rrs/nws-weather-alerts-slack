const { App } = require('@slack/bolt');
const { CAPParser } = require('./dist/services/capParser');
const { buildHomeView, buildAlertDetailModal, buildAddFeedModal, buildEditFeedModal } = require('./functions/home-builder');
const { formatAlertMessage, formatAlertBlocks } = require('./functions/alert-formatter');
const { getSubscriptions, addSubscription, removeSubscription, toggleSubscription, getProcessedAlerts, markAlertAsProcessed } = require('./functions/data-store');
const { isAdmin } = require('./config/admins');
require('dotenv').config();

// Production-grade app with monitoring and auto-restart
class WeatherAlertsApp {
  constructor() {
    this.app = null;
    this.pollingInterval = null;
    this.healthCheckInterval = null;
    this.lastSuccessfulCheck = Date.now();
    this.consecutiveFailures = 0;
    this.maxFailures = 3;
    this.isShuttingDown = false;
    this.startTime = Date.now();
    
    this.TARGET_CHANNEL = process.env.TARGET_CHANNEL_ID || 'C09BA83JGNS';
    this.POLLING_INTERVAL = (parseInt(process.env.POLLING_INTERVAL_MINUTES) || 5) * 60 * 1000;
    this.HEALTH_CHECK_INTERVAL = 30 * 1000; // 30 seconds
    
    this.capParser = new CAPParser();
    
    this.initializeApp();
    this.setupProcessHandlers();
  }
  
  initializeApp() {
    this.app = new App({
      token: process.env.SLACK_BOT_TOKEN,
      signingSecret: process.env.SLACK_SIGNING_SECRET,
      socketMode: true,
      appToken: process.env.SLACK_APP_TOKEN,
    });
    
    this.setupEventHandlers();
    this.setupActionHandlers();
  }
  
  setupEventHandlers() {
    this.app.event('app_home_opened', async ({ event, client }) => {
      try {
        console.log(`📱 App home opened by user ${event.user}`);
        const homeView = await buildHomeView(event.user);
        await client.views.publish({
          user_id: event.user,
          view: homeView
        });
      } catch (error) {
        console.error('❌ Error handling app_home_opened:', error);
        this.logError('app_home_opened', error);
      }
    });
  }
  
  setupActionHandlers() {
    // Alert details modal
    this.app.action('view_alert_details', async ({ ack, body, client }) => {
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
            description: 'Snow will develop tonight and continue through Tuesday morning. Snow accumulations of 2 to 4 inches are expected with locally higher amounts possible.',
            instruction: 'Slow down and use caution while traveling. Check road conditions before departing.',
            link: 'https://api.weather.gov/alerts/test'
          },
          subscription: {
            name: 'Bergen County, NJ',
            zone: 'NJZ103'
          }
        };
        
        const modal = buildAlertDetailModal(testData);
        await client.views.open({
          trigger_id: body.trigger_id,
          view: modal
        });
        
        console.log('✅ Alert details modal opened successfully');
      } catch (error) {
        console.error('❌ Error opening alert details modal:', error);
        this.logError('view_alert_details', error);
      }
    });
    
    // Add feed functionality
    this.app.action('add_feed', async ({ ack, body, client }) => {
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
        console.error('❌ Error opening add feed modal:', error);
        this.logError('add_feed', error);
      }
    });
    
    // Add feed submission
    this.app.view('add_feed_submission', async ({ ack, body, view, client }) => {
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
        
        console.log(`📡 New feed added: ${name} by ${body.user.id}`);
      } catch (error) {
        console.error('❌ Error adding feed:', error);
        this.logError('add_feed_submission', error);
      }
    });
    
    // Feed management
    this.app.action('feed_menu', async ({ ack, body, client }) => {
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
        
        console.log(`⚙️ Feed ${actionText.toLowerCase()} by ${body.user.id}`);
      } catch (error) {
        console.error('❌ Error handling feed menu:', error);
        this.logError('feed_menu', error);
      }
    });
    
    // Refresh home
    this.app.action('refresh_home', async ({ ack, body, client }) => {
      await ack();
      
      try {
        const homeView = await buildHomeView(body.user.id);
        await client.views.publish({
          user_id: body.user.id,
          view: homeView
        });
      } catch (error) {
        console.error('❌ Error refreshing home view:', error);
        this.logError('refresh_home', error);
      }
    });
  }
  
  async checkForAlerts() {
    console.log('🌦️ Checking for weather alerts...');
    const checkStart = Date.now();
    
    try {
      const subscriptions = await getSubscriptions();
      const processedAlerts = await getProcessedAlerts();
      let alertsFound = 0;
      
      for (const subscription of subscriptions) {
        if (!subscription.active) continue;
        
        try {
          const alerts = await this.capParser.fetchAndParseFeed(subscription.url);
          
          for (const alert of alerts) {
            if (!processedAlerts.has(alert.id)) {
              await this.postAlertToSlack(alert, subscription);
              await markAlertAsProcessed(alert.id);
              alertsFound++;
            }
          }
        } catch (error) {
          console.error(`❌ Error checking feed ${subscription.url}:`, error);
          this.consecutiveFailures++;
        }
      }
      
      this.lastSuccessfulCheck = Date.now();
      this.consecutiveFailures = 0;
      
      const duration = Date.now() - checkStart;
      console.log(`✅ Alert check completed in ${duration}ms. Found ${alertsFound} new alerts.`);
      
    } catch (error) {
      console.error('❌ Critical error in alert checking:', error);
      this.consecutiveFailures++;
      this.logError('checkForAlerts', error);
    }
  }
  
  async postAlertToSlack(alert, subscription) {
    try {
      const blocks = formatAlertBlocks(alert, subscription);
      
      await this.app.client.chat.postMessage({
        channel: this.TARGET_CHANNEL,
        text: formatAlertMessage(alert),
        blocks: blocks
      });
      
      console.log(`🚨 Posted alert ${alert.id} to Slack - ${alert.event}`);
      
      // Send notification to admins for severe alerts
      if (alert.severity === 'Extreme' || alert.severity === 'Severe') {
        await this.notifyAdmins(alert, subscription);
      }
      
    } catch (error) {
      console.error('❌ Error posting alert to Slack:', error);
      this.logError('postAlertToSlack', error);
      throw error;
    }
  }
  
  async notifyAdmins(alert, subscription) {
    try {
      const { ADMIN_USERS } = require('./config/admins');
      
      for (const adminId of ADMIN_USERS) {
        await this.app.client.chat.postMessage({
          channel: adminId,
          text: `🚨 **CRITICAL WEATHER ALERT** 🚨\n\n${alert.event} for ${subscription.name}\nSeverity: ${alert.severity}\n\nCheck #alerts-weather for details.`
        });
      }
    } catch (error) {
      console.error('❌ Error notifying admins:', error);
    }
  }
  
  startHealthCheck() {
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, this.HEALTH_CHECK_INTERVAL);
    
    console.log(`💓 Health monitoring started (${this.HEALTH_CHECK_INTERVAL/1000}s intervals)`);
  }
  
  async performHealthCheck() {
    const now = Date.now();
    const timeSinceLastCheck = now - this.lastSuccessfulCheck;
    const maxAllowedDelay = this.POLLING_INTERVAL * 2; // Allow 2x polling interval
    
    console.log(`💓 Health check - Last successful: ${Math.round(timeSinceLastCheck/1000)}s ago, Failures: ${this.consecutiveFailures}`);
    
    // Check if we've had too many failures
    if (this.consecutiveFailures >= this.maxFailures) {
      console.error(`🚨 CRITICAL: ${this.consecutiveFailures} consecutive failures detected!`);
      await this.sendCriticalAlert('Multiple consecutive failures detected');
    }
    
    // Check if last successful check was too long ago
    if (timeSinceLastCheck > maxAllowedDelay) {
      console.error(`🚨 CRITICAL: Last successful check was ${Math.round(timeSinceLastCheck/60000)} minutes ago!`);
      await this.sendCriticalAlert('Alert monitoring has been offline too long');
    }
    
    // Test Slack connection
    try {
      await this.app.client.auth.test();
      console.log('✅ Slack connection healthy');
    } catch (error) {
      console.error('❌ Slack connection failed:', error);
      await this.handleConnectionFailure();
    }
  }
  
  async sendCriticalAlert(reason) {
    try {
      const { ADMIN_USERS } = require('./config/admins');
      const uptime = Math.round((Date.now() - this.startTime) / 60000);
      
      const message = `🚨 **WEATHER ALERTS SYSTEM FAILURE** 🚨\n\nReason: ${reason}\nUptime: ${uptime} minutes\nTime: ${new Date().toLocaleString()}\n\n**IMMEDIATE ACTION REQUIRED**`;
      
      for (const adminId of ADMIN_USERS) {
        await this.app.client.chat.postMessage({
          channel: adminId,
          text: message
        });
      }
      
      // Also post to the alerts channel
      await this.app.client.chat.postMessage({
        channel: this.TARGET_CHANNEL,
        text: `🚨 **SYSTEM ALERT**: Weather monitoring system requires attention. Admins have been notified.`
      });
      
    } catch (error) {
      console.error('❌ Failed to send critical alert:', error);
    }
  }
  
  async handleConnectionFailure() {
    console.log('🔄 Attempting to reconnect to Slack...');
    
    try {
      // Stop current app
      if (this.app) {
        await this.app.stop();
      }
      
      // Wait a moment
      await new Promise(resolve => setTimeout(resolve, 5000));
      
      // Reinitialize
      this.initializeApp();
      await this.app.start();
      
      console.log('✅ Successfully reconnected to Slack');
      this.consecutiveFailures = 0;
      
    } catch (error) {
      console.error('❌ Failed to reconnect:', error);
      this.consecutiveFailures++;
    }
  }
  
  logError(operation, error) {
    const logEntry = {
      timestamp: new Date().toISOString(),
      operation,
      error: error.message,
      stack: error.stack
    };
    
    console.error(`📝 Error logged:`, logEntry);
    
    // In production, you might want to write this to a file or external logging service
  }
  
  setupProcessHandlers() {
    // Graceful shutdown
    process.on('SIGINT', () => this.gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => this.gracefulShutdown('SIGTERM'));
    
    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      console.error('🚨 Uncaught Exception:', error);
      this.logError('uncaughtException', error);
      // Don't exit, just log
    });
    
    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      console.error('🚨 Unhandled Rejection at:', promise, 'reason:', reason);
      this.logError('unhandledRejection', new Error(reason));
      // Don't exit, just log
    });
  }
  
  async gracefulShutdown(signal) {
    if (this.isShuttingDown) return;
    
    console.log(`\n🛑 Received ${signal}. Starting graceful shutdown...`);
    this.isShuttingDown = true;
    
    try {
      // Clear intervals
      if (this.pollingInterval) {
        clearInterval(this.pollingInterval);
        console.log('⏹️ Stopped polling interval');
      }
      
      if (this.healthCheckInterval) {
        clearInterval(this.healthCheckInterval);
        console.log('⏹️ Stopped health check interval');
      }
      
      // Stop Slack app
      if (this.app) {
        await this.app.stop();
        console.log('⏹️ Stopped Slack app');
      }
      
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
      
    } catch (error) {
      console.error('❌ Error during shutdown:', error);
      process.exit(1);
    }
  }
  
  async start() {
    try {
      console.log('🚀 Starting NWS Weather Alerts (Production Mode)...');
      console.log('=' .repeat(50));
      
      await this.app.start();
      console.log('✅ Connected to Slack');
      
      // Start polling
      this.pollingInterval = setInterval(() => {
        this.checkForAlerts();
      }, this.POLLING_INTERVAL);
      
      console.log(`⏱️ Alert polling started (${this.POLLING_INTERVAL/60000} minute intervals)`);
      
      // Start health monitoring
      this.startHealthCheck();
      
      // Initial check
      await this.checkForAlerts();
      
      console.log('=' .repeat(50));
      console.log('🌦️ NWS Weather Alerts is running in PRODUCTION MODE');
      console.log(`📡 Monitoring Bergen County zones (NJZ103, NJZ104)`);
      console.log(`📢 Posting alerts to channel: ${this.TARGET_CHANNEL}`);
      console.log(`💓 Health checks every ${this.HEALTH_CHECK_INTERVAL/1000} seconds`);
      console.log(`🔄 Auto-restart on failures enabled`);
      console.log('=' .repeat(50));
      
    } catch (error) {
      console.error('❌ Failed to start app:', error);
      process.exit(1);
    }
  }
}

// Start the production app
const weatherApp = new WeatherAlertsApp();
weatherApp.start();